import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';

import 'package:webview_flutter/webview_flutter.dart';
import '../features/wallet/data/wallet_api.dart';
import '../core/storage/token_manager.dart';
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

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);

    _initializeGameAndDeductFee();

    final token = TokenManager.token ?? '';
    final fullUrl = widget.gameUrl.startsWith('http')
        ? widget.gameUrl
        : '${ApiService.serverDomain}${widget.gameUrl.startsWith('/') ? '' : '/'}${widget.gameUrl}';
    final formattedUrl = fullUrl.contains('?')
        ? '$fullUrl&token=${Uri.encodeComponent(token)}'
        : '$fullUrl?token=${Uri.encodeComponent(token)}';

    if (kIsWeb) {
      registerIframeViewFactory(_viewId, formattedUrl);
      _msgSubscription = setupWebMessageListener((msgStr) async {
        if (mounted) {
          try {
            final dynamic json = jsonDecode(msgStr);
            if (json is Map<String, dynamic>) {
              // Security validation: check source schema and version
              final String source = json['source']?.toString() ?? '';
              final int version = (json['version'] as num?)?.toInt() ?? 1;
              final String type = json['type']?.toString() ?? '';

              if (source == 'ingames-game' && version >= 1) {
                if (type == 'EXIT_GAME' || type == 'EXIT_MATCH') {
                  _exitGame();
                } else if (type == 'WALLET_UPDATED' || type == 'ROUND_RESULT') {
                  _refreshProfileBalance();
                }
              }
            }
          } catch (_) {}
        }
      });
    } else {
      _webViewController = WebViewController()
        ..setJavaScriptMode(JavaScriptMode.unrestricted)
        ..setNavigationDelegate(
          NavigationDelegate(
            onPageStarted: (_) {
              try {
                _webViewController?.runJavaScript("""
                  window.IN_GAMES_AUTH_TOKEN = '$token';
                  window.IN_GAMES_SERVER_URL = '${ApiService.baseUrl}';
                """);
              } catch (_) {}
            },
            onPageFinished: (_) {
              if (mounted) {
                setState(() {
                  _isLoading = false;
                });
                try {
                  _webViewController?.runJavaScript("""
                    window.IN_GAMES_AUTH_TOKEN = '$token';
                    window.IN_GAMES_SERVER_URL = '${ApiService.baseUrl}';
                  """);
                } catch (_) {}
              }
            },
            onWebResourceError: (WebResourceError error) {
              // Ignore subresource errors (e.g. socket reconnects or offline asset pings) so local WebView stays open
              final isMainFrame = error.isForMainFrame ?? false;
              if (mounted && isMainFrame && error.errorType == WebResourceErrorType.fileNotFound) {
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
                final String type = json['type']?.toString() ?? '';
                if (type == 'EXIT_GAME' || type == 'EXIT_MATCH') {
                  _exitGame();
                } else if (type == 'WALLET_UPDATED' || type == 'ROUND_RESULT') {
                  _refreshProfileBalance();
                }
              }
            } catch (_) {}
          },
        );

      if (formattedUrl.startsWith('http')) {
        _webViewController?.loadRequest(Uri.parse(formattedUrl));
      } else {
        _webViewController?.loadFlutterAsset('assets/game/seven_up_down/index.html');
      }
    }
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
            if (window.soundManager) {
              window.soundManager.stopAll();
            }
          """);
        } catch (_) {}
      }
    } else if (state == AppLifecycleState.resumed) {
      if (!kIsWeb && _webViewController != null) {
        try {
          _webViewController?.runJavaScript("""
            if (window.soundManager) {
              window.soundManager.resume();
            }
          """);
        } catch (_) {}
      }
    }
  }

  Future<void> _initializeGameAndDeductFee() async {
    try {
      await _refreshProfileBalance();
    } catch (_) {}
    if (mounted) {
      setState(() {
        _isLoading = false;
      });
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
      if (mounted) {
        widget.onBackPressed();
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final is7UpDown = widget.gameTitle.toLowerCase().contains('7 up down');

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
          // 1. Full-screen HTML5 Game Canvas (Fills entire screen from top to bottom)
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
                      _webViewController?.reload();
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
                                const SizedBox(height: 8),
                                Text(
                                  'Entry Fee: ₹${widget.entryFee.toStringAsFixed(0)} | Prize: ₹${widget.prizePool.toStringAsFixed(0)}',
                                  style: GoogleFonts.poppins(color: Colors.white70, fontSize: 14),
                                ),
                              ],
                            ),
                          ))),
          ),



            // Match Loading Overlay
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
                        is7UpDown
                            ? 'Loading ${widget.gameTitle} Table...'
                            : 'Deducting Entry Fee ₹${widget.entryFee.toStringAsFixed(0)}...',
                        style: GoogleFonts.poppins(
                          color: Colors.white,
                          fontSize: 16,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const SizedBox(height: 6),
                      Text(
                        is7UpDown
                            ? 'Preparing live betting table...'
                            : 'Connecting to HTML5 Game Engine...',
                        style: GoogleFonts.poppins(
                          color: Colors.white54,
                          fontSize: 13,
                        ),
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
