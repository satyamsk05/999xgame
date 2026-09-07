import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';

import '../services/api_service.dart';
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

class _Html5GameScreenState extends State<Html5GameScreen> {
  final String _viewId = 'html5_game_iframe_${DateTime.now().millisecondsSinceEpoch}';
  bool _isLoading = true;
  bool _isMatchFinished = false;

  @override
  void initState() {
    super.initState();

    _initializeGameAndDeductFee();

    if (kIsWeb) {
      registerIframeViewFactory(_viewId, widget.gameUrl);
      setupWebMessageListener((msgStr) async {
        if (mounted) {
          try {
            if (msgStr.contains('EXIT_MATCH')) {
              _exitGame();
            } else if (msgStr.contains('MATCH_FINISHED') || msgStr.contains('WALLET_UPDATED')) {
              setState(() {
                _isMatchFinished = true;
              });
              _refreshProfileBalance();
            }
          } catch (_) {}
        }
      });
    }
  }

  Future<void> _initializeGameAndDeductFee() async {
    if (widget.entryFee > 0) {
      await ApiService.joinGame(gameId: widget.gameTitle, entryFee: widget.entryFee);
      await _refreshProfileBalance();
    }
    if (mounted) {
      setState(() {
        _isLoading = false;
      });
    }
  }

  Future<void> _refreshProfileBalance() async {
    final profile = await ApiService.getUserProfile();
    if (profile != null && profile['data'] != null) {
      final totalBalance = (profile['data']['totalBalance'] as num?)?.toDouble() ?? 0.0;
      if (mounted && widget.onBalanceUpdated != null) {
        widget.onBalanceUpdated!(totalBalance);
      }
    }
  }

  void _exitGame() {
    widget.onBackPressed();
  }

  void _showSettingsBottomSheet() {
    bool soundOn = true;

    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      isDismissible: true,
      enableDrag: true,
      builder: (modalContext) => StatefulBuilder(
        builder: (modalContext, setSheetState) => Container(
          decoration: BoxDecoration(
            gradient: const LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [
                Color(0xFF2E1065),
                Color(0xFF15042A),
              ],
            ),
            borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
            border: Border.all(
              color: const Color(0xFF7C3AED),
              width: 1.5,
            ),
            boxShadow: [
              BoxShadow(
                color: Colors.purple.shade900.withValues(alpha: 0.6),
                blurRadius: 30,
                spreadRadius: 4,
              ),
            ],
          ),
          padding: const EdgeInsets.only(left: 20, right: 20, top: 12, bottom: 28),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              // Top Drag Handle Bar
              Center(
                child: Container(
                  width: 42,
                  height: 4.5,
                  decoration: BoxDecoration(
                    color: Colors.white30,
                    borderRadius: BorderRadius.circular(10),
                  ),
                ),
              ),
              const SizedBox(height: 16),

              // Title Row with Settings Icon & Close Button
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.all(8),
                        decoration: BoxDecoration(
                          color: const Color(0xFF7C3AED).withValues(alpha: 0.25),
                          shape: BoxShape.circle,
                        ),
                        child: const Icon(
                          Icons.settings_rounded,
                          color: Color(0xFFA78BFA),
                          size: 20,
                        ),
                      ),
                      const SizedBox(width: 10),
                      Text(
                        'Game Settings',
                        style: GoogleFonts.poppins(
                          color: Colors.white,
                          fontSize: 17,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                  ),
                  InkWell(
                    onTap: () => Navigator.of(modalContext).pop(),
                    borderRadius: BorderRadius.circular(20),
                    child: Container(
                      padding: const EdgeInsets.all(6),
                      decoration: const BoxDecoration(
                        color: Colors.white10,
                        shape: BoxShape.circle,
                      ),
                      child: const Icon(Icons.close_rounded, color: Colors.white70, size: 18),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 20),

              // Sound & Audio Control Card
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                decoration: BoxDecoration(
                  color: const Color(0xFF1E0B36),
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: Colors.white.withValues(alpha: 0.1)),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Row(
                      children: [
                        Icon(
                          soundOn ? Icons.volume_up_rounded : Icons.volume_off_rounded,
                          color: soundOn ? const Color(0xFF00E676) : Colors.white38,
                          size: 22,
                        ),
                        const SizedBox(width: 10),
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Sound Effects',
                              style: GoogleFonts.poppins(
                                color: Colors.white,
                                fontSize: 13.5,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                            Text(
                              soundOn ? 'Sound is Enabled' : 'Sound is Muted',
                              style: GoogleFonts.poppins(
                                color: soundOn ? const Color(0xFF00E676) : Colors.white38,
                                fontSize: 10.5,
                                fontWeight: FontWeight.w500,
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                    Switch(
                      value: soundOn,
                      onChanged: (val) {
                        setSheetState(() {
                          soundOn = val;
                        });
                      },
                      activeTrackColor: const Color(0xFF00E676).withValues(alpha: 0.4),
                      activeThumbColor: const Color(0xFF00E676),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),

              // Warning Notice
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                decoration: BoxDecoration(
                  color: const Color(0xFFFFB74D).withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: const Color(0xFFFFB74D).withValues(alpha: 0.3)),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.warning_amber_rounded, color: Color(0xFFFFB74D), size: 16),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        'Leaving will forfeit your match entry fee!',
                        style: GoogleFonts.poppins(
                          color: const Color(0xFFFFB74D),
                          fontSize: 10.5,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 20),

              // EXIT MATCH Button (Red)
              ElevatedButton.icon(
                onPressed: () {
                  Navigator.of(modalContext).pop();
                  _exitGame();
                },
                icon: const Icon(Icons.exit_to_app_rounded, color: Colors.white, size: 18),
                label: Text(
                  'EXIT MATCH',
                  style: GoogleFonts.poppins(
                    fontWeight: FontWeight.w700,
                    fontSize: 13.5,
                    letterSpacing: 0.5,
                  ),
                ),
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFFDC2626),
                  foregroundColor: Colors.white,
                  minimumSize: const Size(double.infinity, 46),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                  elevation: 4,
                ),
              ),
            ],
          ),
        ),
      ),
    );
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
      backgroundColor: is7UpDown ? const Color(0xFF100334) : const Color(0xFF12021A),
      body: Container(
        decoration: BoxDecoration(
          gradient: is7UpDown
              ? const RadialGradient(
                  center: Alignment(0.0, -0.6),
                  radius: 1.4,
                  colors: [
                    Color(0xFF5D25B5),
                    Color(0xFF2E0D6C),
                    Color(0xFF100334),
                  ],
                  stops: [0.0, 0.6, 1.0],
                )
              : null,
          color: is7UpDown ? null : const Color(0xFF12021A),
        ),
        child: SafeArea(
          child: Column(
            children: [
              // Top Header Bar (Circular Back Button, Game-aware Timer & Pot)
              if (!_isMatchFinished)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                  color: Colors.transparent,
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  crossAxisAlignment: CrossAxisAlignment.center,
                  children: [
                    // Left: Fully Circular 3D Back Button & Label
                    Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        InkWell(
                          onTap: _showSettingsBottomSheet,
                          borderRadius: BorderRadius.circular(22),
                          child: Container(
                            width: 36,
                            height: 36,
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              gradient: const LinearGradient(
                                begin: Alignment.topLeft,
                                end: Alignment.bottomRight,
                                colors: [
                                  Color(0xFF8B5CF6),
                                  Color(0xFF5B21B6),
                                ],
                              ),
                              border: Border.all(
                                color: const Color(0xFFA78BFA).withValues(alpha: 0.7),
                                width: 2,
                              ),
                              boxShadow: [
                                BoxShadow(
                                  color: Colors.purple.shade900.withValues(alpha: 0.6),
                                  blurRadius: 8,
                                  offset: const Offset(0, 3),
                                ),
                              ],
                            ),
                            child: const Icon(
                              Icons.settings_rounded,
                              color: Colors.white,
                              size: 19,
                            ),
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          'Settings',
                          style: GoogleFonts.poppins(
                            color: Colors.white70,
                            fontSize: 9.5,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    ),

                    // Center: Stopwatch Timer Pill (Level with Back Button at top)
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
                      decoration: BoxDecoration(
                        color: const Color(0xFF2E1065).withValues(alpha: 0.9),
                        borderRadius: BorderRadius.circular(30),
                        border: Border.all(
                          color: const Color(0xFF7C3AED).withValues(alpha: 0.8),
                          width: 1.5,
                        ),
                        boxShadow: [
                          BoxShadow(
                            color: const Color(0xFF6D28D9).withValues(alpha: 0.35),
                            blurRadius: 10,
                            offset: const Offset(0, 3),
                          ),
                        ],
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Icon(
                            Icons.timer_outlined,
                            color: Colors.white,
                            size: 18,
                          ),
                          const SizedBox(width: 6),
                          Text(
                            'LIVE 🟢',
                            style: GoogleFonts.poppins(
                              color: const Color(0xFF00E676),
                              fontSize: 15,
                              fontWeight: FontWeight.w800,
                              letterSpacing: 0.8,
                            ),
                          ),
                        ],
                      ),
                    ),

                    // Right: Pot Label & Amount Pill (Hidden for 7 Up Down) + Ping Indicator
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        if (!is7UpDown)
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.center,
                            children: [
                              Text(
                                'Pot',
                                style: GoogleFonts.poppins(
                                  color: Colors.white70,
                                  fontSize: 11,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                              const SizedBox(height: 1),
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 3.5),
                                decoration: BoxDecoration(
                                  color: const Color(0xFF2E1065).withValues(alpha: 0.9),
                                  borderRadius: BorderRadius.circular(16),
                                  border: Border.all(
                                    color: const Color(0xFF7C3AED).withValues(alpha: 0.8),
                                    width: 1.2,
                                  ),
                                  boxShadow: [
                                    BoxShadow(
                                      color: Colors.purple.shade900.withValues(alpha: 0.4),
                                      blurRadius: 6,
                                      offset: const Offset(0, 2),
                                    ),
                                  ],
                                ),
                                child: Text(
                                  '₹${widget.prizePool.toStringAsFixed(0)}',
                                  style: GoogleFonts.poppins(
                                    color: Colors.white,
                                    fontSize: 14,
                                    fontWeight: FontWeight.w800,
                                  ),
                                ),
                              ),
                              const SizedBox(height: 6),
                            ],
                          ),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                          decoration: BoxDecoration(
                            color: const Color(0xFF1E1035),
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(
                              color: const Color(0xFF7C3AED).withValues(alpha: 0.5),
                              width: 1,
                            ),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              const Icon(
                                Icons.wifi,
                                color: Color(0xFF00E676),
                                size: 13,
                              ),
                              const SizedBox(width: 4),
                              Text(
                                '35ms',
                                style: GoogleFonts.poppins(
                                  color: const Color(0xFF00E676),
                                  fontSize: 11.5,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),

            // HTML5 Game Canvas (Expanded)
            Expanded(
              child: Stack(
                children: [
                  if (kIsWeb)
                    buildPlatformIframe(_viewId)
                  else
                    // Non-web placeholder preview
                    Center(
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
                    ),

            // Match Loading Overlay
            if (_isLoading)
              Container(
                color: is7UpDown ? const Color(0xFF0B0626) : const Color(0xFF12021A),
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
        ),
      ],
    ),
  ),
),
    );
  }
}
