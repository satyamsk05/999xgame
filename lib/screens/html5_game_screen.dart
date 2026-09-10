import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';

import 'package:webview_flutter/webview_flutter.dart';
import '../core/api/api_client.dart';
import '../features/wallet/data/wallet_api.dart';
import '../services/api_service.dart';
import '../widgets/network_error_widget.dart';
import 'html5_helper.dart';

class Html5GameScreen extends StatefulWidget {
  final String gameTitle;
  final double entryFee;
  final double prizePool;
  final String gameUrl;
  final VoidCallback onBackPressed;
  final Function(double newBalance)? onBalanceUpdated;

  const Html5GameScreen({
    super.key,
    required this.gameTitle,
    required this.entryFee,
    required this.prizePool,
    required this.gameUrl,
    required this.onBackPressed,
    this.onBalanceUpdated,
  });

  @override
  State<Html5GameScreen> createState() => _Html5GameScreenState();
}

class _Html5GameScreenState extends State<Html5GameScreen> with WidgetsBindingObserver {
  final String _viewId = 'html5_game_iframe_${DateTime.now().millisecondsSinceEpoch}';
  bool _isLoading = true;
  bool _hasWebError = false;
  WebViewController? _webViewController;
  StreamSubscription? _msgSubscription;

  String get _gameId {
    final match = RegExp(r'/games/([^/]+)/').firstMatch(widget.gameUrl);
    return match?.group(1) ?? 'seven_up_down';
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    unawaited(_initializeGame());
  }

  Future<void> _initializeGame() async {
    try {
      final sessionResponse = await ApiClient.post('/games/session', {'gameId': _gameId});
      final data = sessionResponse['data'];
      final token = data is Map<String, dynamic> ? data['token']?.toString() : null;
      if (token == null || token.isEmpty) {
        throw ApiException(
          code: 'GAME_SESSION_FAILED',
          message: 'Unable to start a secure game session.',
          statusCode: 500,
        );
      }
      await _initializeGameView(token);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _hasWebError = true;
        _isLoading = false;
      });
    }

    try {
      await _refreshProfileBalance();
    } catch (_) {}
  }

  bool _isTrustedGameOrigin(String url, Uri trustedUri) {
    final candidate = Uri.tryParse(url);
    if (candidate == null || candidate.scheme.isEmpty || candidate.host.isEmpty) return false;
    return candidate.scheme == trustedUri.scheme &&
        candidate.host == trustedUri.host &&
        candidate.port == trustedUri.port;
  }

  Future<void> _initializeGameView(String sessionToken) async {
    final fullUrl = widget.gameUrl.startsWith('http')
        ? widget.gameUrl
        : '${ApiService.serverDomain}${widget.gameUrl.startsWith('/') ? '' : '/'}${widget.gameUrl}';
    final trustedUri = Uri.parse(fullUrl);

    // Keep the short-lived credential in the URL fragment. Fragments are not sent in
    // HTTP requests or referrers, and the game reads it locally from location.hash.
    final separator = fullUrl.contains('#') ? '&' : '#';
    final formattedUrl = '$fullUrl${separator}token=${Uri.encodeComponent(sessionToken)}';

    if (kIsWeb) {
      registerIframeViewFactory(_viewId, formattedUrl);
      _msgSubscription = setupWebMessageListener((msgStr) async {
        if (!mounted) return;
        try {
          final dynamic json = jsonDecode(msgStr);
          if (json is Map<String, dynamic>) {
            final source = json['source']?.toString() ?? '';
            final version = (json['version'] as num?)?.toInt() ?? 0;
            final type = json['type']?.toString() ?? '';
            if (source == 'ingames-game' && version >= 1) {
              if (type == 'EXIT_GAME' || type == 'EXIT_MATCH') {
                _exitGame();
              } else if (type == 'WALLET_UPDATED' || type == 'ROUND_RESULT') {
                _refreshProfileBalance();
              }
            }
          }
        } catch (_) {}
      });
      if (mounted) setState(() => _isLoading = false);
      return;
    }

    _webViewController = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setNavigationDelegate(
        NavigationDelegate(
          onNavigationRequest: (NavigationRequest request) {
            return _isTrustedGameOrigin(request.url, trustedUri)
                ? NavigationDecision.navigate
                : NavigationDecision.prevent;
          },
          onPageFinished: (url) {
            if (mounted) setState(() => _isLoading = false);
            if (!_isTrustedGameOrigin(url, trustedUri)) return;
            try {
              _webViewController?.runJavaScript("""
                window.IN_GAMES_SERVER_URL = '${ApiService.baseUrl}';
              """);
            } catch (_) {}
          },
          onWebResourceError: (WebResourceError error) {
            final isMainFrame = error.isForMainFrame ?? false;
            if (mounted && isMainFrame) {
              setState(() {
                _hasWebError = true;
                _isLoading = false;
              });
            }
          },
        ),
      )
      ..addJavaScriptChannel(
        'InGamesNativeBridge',
        onMessageReceived: (JavaScriptMessage message) {
          try {
            final dynamic json = jsonDecode(message.message);
            if (json is Map<String, dynamic>) {
              final source = json['source']?.toString() ?? '';
              final version = (json['version'] as num?)?.toInt() ?? 0;
              final type = json['type']?.toString() ?? '';
              if (source != 'ingames-game' || version < 1) return;
              if (type == 'EXIT_GAME' || type == 'EXIT_MATCH') {
                _exitGame();
              } else if (type == 'WALLET_UPDATED' || type == 'ROUND_RESULT') {
                _refreshProfileBalance();
              }
            }
          } catch (_) {}
        },
      );

    _webViewController!.loadRequest(Uri.parse(formattedUrl));
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _msgSubscription?.cancel();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    final isBackground = state == AppLifecycleState.paused ||
        state == AppLifecycleState.inactive ||
        state == AppLifecycleState.detached ||
        state == AppLifecycleState.hidden;

    if (isBackground) {
      if (!kIsWeb && _webViewController != null) {
        try {
          _webViewController?.runJavaScript("""
            if (window.soundManager) window.soundManager.stopAll();
          """);
        } catch (_) {}
      }
    } else if (state == AppLifecycleState.resumed) {
      if (!kIsWeb && _webViewController != null) {
        try {
          _webViewController?.runJavaScript("""
            if (window.soundManager) window.soundManager.resume();
          """);
        } catch (_) {}
      }
    }
  }

  Future<void> _refreshProfileBalance() async {
    try {
      final profile = await WalletApi.getUserProfile();
      if (profile.containsKey('totalBalance')) {
        final totalBalance = (profile['totalBalance'] as num?)?.toDouble() ?? 0.0;
        if (mounted && widget.onBalanceUpdated != null) {
          widget.onBalanceUpdated!(totalBalance);
        }
      }
    } catch (_) {}
  }

  void _exitGame() {
    if (!mounted) return;
    _msgSubscription?.cancel();
    Future.microtask(() {
      if (mounted) widget.onBackPressed();
    });
  }

  @override
  Widget build(BuildContext context) {
    SystemChrome.setSystemUIOverlayStyle(
      const SystemUiOverlayStyle(
        statusBarColor: Colors.transparent,
        statusBarIconBrightness: Brightness.light,
        statusBarBrightness: Brightness.dark,
      ),
    );

    return Scaffold(
      backgroundColor: const Color(0xFF20084B),
      body: Stack(
        children: [
          Positioned.fill(
            child: _hasWebError
                ? NetworkErrorWidget(
                    customTitle: "Couldn't Load",
                    customMessage: 'There was a problem trying to load the screen',
                    onRetry: () {
                      setState(() {
                        _hasWebError = false;
                        _isLoading = true;
                      });
                      unawaited(_initializeGame());
                    },
                  )
                : (kIsWeb
                    ? buildPlatformIframe(_viewId)
                    : (_webViewController != null
                        ? WebViewWidget(controller: _webViewController!)
                        : Center(
                            child: Column(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                const Icon(Icons.sports_esports_rounded, size: 72, color: Color(0xFF00E676)),
                                const SizedBox(height: 16),
                                Text(
                                  '${widget.gameTitle} (HTML5 Engine)',
                                  style: GoogleFonts.poppins(
                                    color: Colors.white,
                                    fontSize: 20,
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                              ],
                            ),
                          ))),
          ),
          if (_isLoading)
            Container(
              color: const Color(0xFF20084B),
              child: Center(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Container(
                      padding: const EdgeInsets.all(20),
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: const Color(0xFF6C20E0).withValues(alpha: 0.3),
                        border: Border.all(color: const Color(0xFF00E676), width: 2),
                      ),
                      child: const CircularProgressIndicator(
                        valueColor: AlwaysStoppedAnimation<Color>(Color(0xFF00E676)),
                      ),
                    ),
                    const SizedBox(height: 20),
                    Text(
                      'Loading ${widget.gameTitle}...',
                      style: GoogleFonts.poppins(
                        color: Colors.white,
                        fontSize: 16,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      'Connecting to live game engine...',
                      style: GoogleFonts.poppins(color: Colors.white54, fontSize: 13),
                    ),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}