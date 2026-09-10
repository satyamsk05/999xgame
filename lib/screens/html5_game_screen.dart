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

  const Html5GameScreen({super.key, required this.gameTitle, required this.entryFee, required this.prizePool, required this.gameUrl, required this.onBackPressed, this.onBalanceUpdated});

  @override
  State<Html5GameScreen> createState() => _Html5GameScreenState();
}

class _Html5GameScreenState extends State<Html5GameScreen> with WidgetsBindingObserver {
  final String _viewId = 'html5_game_iframe_${DateTime.now().microsecondsSinceEpoch}';
  bool _isLoading = true;
  bool _hasWebError = false;
  bool _isInitializing = false;
  bool _isIframeRegistered = false;
  int _initializationGeneration = 0;
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
    if (_isInitializing) return;
    _isInitializing = true;
    final generation = ++_initializationGeneration;
    if (mounted) {
      setState(() {
        _hasWebError = false;
        _isLoading = true;
      });
    }

    try {
      final sessionResponse = await ApiClient.post('/games/session', {'gameId': _gameId});
      if (!mounted || generation != _initializationGeneration) return;
      final data = sessionResponse['data'];
      final token = data is Map<String, dynamic> ? data['token']?.toString() : null;
      if (token == null || token.isEmpty) {
        throw ApiException(code: 'GAME_SESSION_FAILED', message: 'Unable to start a secure game session.', statusCode: 500);
      }
      await _initializeGameView(token, generation);
      if (!mounted || generation != _initializationGeneration) return;
    } catch (_) {
      if (!mounted || generation != _initializationGeneration) return;
      setState(() {
        _hasWebError = true;
        _isLoading = false;
      });
    } finally {
      if (generation == _initializationGeneration) _isInitializing = false;
    }

    if (!mounted || generation != _initializationGeneration) return;
    await _refreshProfileBalance();
  }

  bool _isTrustedGameOrigin(String url, Uri trustedUri) {
    final candidate = Uri.tryParse(url);
    if (candidate == null || candidate.scheme.isEmpty || candidate.host.isEmpty) return false;
    return candidate.scheme == trustedUri.scheme && candidate.host == trustedUri.host && candidate.port == trustedUri.port;
  }

  Future<void> _initializeGameView(String sessionToken, int generation) async {
    final fullUrl = widget.gameUrl.startsWith('http')
        ? widget.gameUrl
        : '${ApiService.serverDomain}${widget.gameUrl.startsWith('/') ? '' : '/'}${widget.gameUrl}';
    final trustedUri = Uri.parse(fullUrl);
    final separator = fullUrl.contains('?') ? '&' : '?';
    final formattedUrl = '$fullUrl${separator}token=${Uri.encodeComponent(sessionToken)}#token=${Uri.encodeComponent(sessionToken)}';

    if (kIsWeb) {
      if (!mounted || generation != _initializationGeneration) return;
      await _msgSubscription?.cancel();
      registerIframeViewFactory(_viewId, formattedUrl);
      _msgSubscription = setupWebMessageListener((msgStr) async {
        if (!mounted || generation != _initializationGeneration) return;
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
                unawaited(_refreshProfileBalance());
              }
            }
          }
        } catch (_) {}
      });
      if (mounted && generation == _initializationGeneration) {
        setState(() {
          _isIframeRegistered = true;
          _isLoading = false;
        });
      }
      return;
    }

    if (!mounted || generation != _initializationGeneration) return;
    _webViewController = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setNavigationDelegate(NavigationDelegate(
        onNavigationRequest: (NavigationRequest request) => _isTrustedGameOrigin(request.url, trustedUri) ? NavigationDecision.navigate : NavigationDecision.prevent,
        onPageFinished: (url) {
          if (!mounted || generation != _initializationGeneration) return;
          setState(() => _isLoading = false);
          if (!_isTrustedGameOrigin(url, trustedUri)) return;
          try { _webViewController?.runJavaScript("window.IN_GAMES_SERVER_URL = '${ApiService.serverDomain}';"); } catch (_) {}
        },
        onWebResourceError: (WebResourceError error) {
          if (!mounted || generation != _initializationGeneration) return;
          if (error.isForMainFrame ?? false) {
            setState(() {
              _hasWebError = true;
              _isLoading = false;
            });
          }
        },
      ))
      ..addJavaScriptChannel('InGamesNativeBridge', onMessageReceived: (JavaScriptMessage message) {
        if (!mounted || generation != _initializationGeneration) return;
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
              unawaited(_refreshProfileBalance());
            }
          }
        } catch (_) {}
      });
    await _webViewController!.loadRequest(Uri.parse(formattedUrl));
  }

  @override
  void dispose() {
    ++_initializationGeneration;
    _isInitializing = false;
    WidgetsBinding.instance.removeObserver(this);
    _msgSubscription?.cancel();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    final isBackground = state == AppLifecycleState.paused || state == AppLifecycleState.inactive || state == AppLifecycleState.detached || state == AppLifecycleState.hidden;
    if (isBackground && !kIsWeb && _webViewController != null) {
      try { _webViewController?.runJavaScript("if (window.soundManager) window.soundManager.stopAll();"); } catch (_) {}
    } else if (state == AppLifecycleState.resumed && !kIsWeb && _webViewController != null) {
      try { _webViewController?.runJavaScript("if (window.soundManager) window.soundManager.resume();"); } catch (_) {}
    }
  }

  Future<void> _refreshProfileBalance() async {
    try {
      final profile = await WalletApi.getUserProfile();
      if (profile.containsKey('totalBalance')) {
        final totalBalance = (profile['totalBalance'] as num?)?.toDouble() ?? 0.0;
        if (mounted && widget.onBalanceUpdated != null) widget.onBalanceUpdated!(totalBalance);
      }
    } catch (_) {}
  }

  void _exitGame() {
    if (!mounted) return;
    _msgSubscription?.cancel();
    Future.microtask(() { if (mounted) widget.onBackPressed(); });
  }

  @override
  Widget build(BuildContext context) {
    SystemChrome.setSystemUIOverlayStyle(const SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      statusBarIconBrightness: Brightness.light,
      statusBarBrightness: Brightness.dark,
    ));

    Widget content;
    if (_hasWebError) {
      content = NetworkErrorWidget(
        customTitle: "Couldn't Load Game",
        customMessage: 'There was a problem trying to connect to ${widget.gameTitle}',
        onRetry: () {
          unawaited(_initializeGame());
        },
      );
    } else if (kIsWeb) {
      content = _isIframeRegistered
          ? buildPlatformIframe(_viewId)
          : const SizedBox.shrink();
    } else if (_webViewController != null) {
      content = WebViewWidget(controller: _webViewController!);
    } else {
      content = Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.sports_esports_rounded, size: 72, color: Color(0xFF00E676)),
            const SizedBox(height: 16),
            Text(
              '${widget.gameTitle} (HTML5 Engine)',
              style: GoogleFonts.poppins(color: Colors.white, fontSize: 20, fontWeight: FontWeight.w700),
            ),
          ],
        ),
      );
    }

    return Scaffold(
      backgroundColor: const Color(0xFF130221),
      body: Stack(
        children: [
          Positioned.fill(child: content),
          if (_isLoading)
            Container(
              color: const Color(0xFF130221),
              child: Center(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Container(
                      width: 64,
                      height: 64,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: const Color(0xFF4C1D95).withValues(alpha: 0.25),
                        border: Border.all(color: const Color(0xFF00E676), width: 2.5),
                      ),
                      padding: const EdgeInsets.all(16),
                      child: const CircularProgressIndicator(
                        strokeWidth: 3.0,
                        valueColor: AlwaysStoppedAnimation<Color>(Color(0xFF00E676)),
                      ),
                    ),
                    const SizedBox(height: 24),
                    Text(
                      'Loading ${widget.gameTitle}...',
                      style: GoogleFonts.poppins(color: Colors.white, fontSize: 17, fontWeight: FontWeight.w700),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      'Connecting to live game engine...',
                      style: GoogleFonts.poppins(color: const Color(0xFF9E92B3), fontSize: 13),
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
