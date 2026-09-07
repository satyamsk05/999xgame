import 'dart:async';
import 'dart:math';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../theme/app_colors.dart';

class OnlineTicker extends StatefulWidget {
  final String? onlineCount;

  const OnlineTicker({
    super.key,
    this.onlineCount,
  });

  @override
  State<OnlineTicker> createState() => _OnlineTickerState();
}

class _OnlineTickerState extends State<OnlineTicker>
    with SingleTickerProviderStateMixin {
  late AnimationController _pulseController;
  late Animation<double> _pulseAnimation;
  Timer? _updateTimer;
  final Random _random = Random();

  final int _currentCount = 1;
  final List<String> _allAvatars = [
    'assets/avatar/avatar_1.png',
    'assets/avatar/avatar_2.png',
    'assets/avatar/avatar_3.png',
    'assets/avatar/avatar_7.png',
    'assets/avatar/avatar_8.png',
    'assets/avatar/avatar_9.png',
  ];

  late List<String> _activeAvatars;
  final List<Color> _borderColors = [
    Colors.amber,
    Colors.orangeAccent,
    Colors.lightBlueAccent,
  ];

  @override
  void initState() {
    super.initState();
    _activeAvatars = [
      _allAvatars[0],
      _allAvatars[1],
      _allAvatars[2],
    ];

    _pulseController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1200),
    )..repeat(reverse: true);

    _pulseAnimation = Tween<double>(begin: 0.3, end: 1.0).animate(
      CurvedAnimation(parent: _pulseController, curve: Curves.easeInOut),
    );

    // Dynamic update for avatars
    _updateTimer = Timer.periodic(const Duration(seconds: 10), (timer) {
      if (!mounted) return;
      setState(() {
        if (widget.onlineCount != null && widget.onlineCount!.isNotEmpty) {
          return;
        }

        // Swap avatar in stack
        final replaceIndex = _random.nextInt(3);
        final unusedAvatars = _allAvatars.where((a) => !_activeAvatars.contains(a)).toList();
        if (unusedAvatars.isNotEmpty) {
          final newAvatar = unusedAvatars[_random.nextInt(unusedAvatars.length)];
          _activeAvatars[replaceIndex] = newAvatar;
        }
      });
    });
  }

  @override
  void dispose() {
    _updateTimer?.cancel();
    _pulseController.dispose();
    super.dispose();
  }

  String _formatCount(int count) {
    final str = count.toString();
    final buffer = StringBuffer();
    for (int i = 0; i < str.length; i++) {
      if (i > 0 && (str.length - i) % 3 == 0) {
        buffer.write(',');
      }
      buffer.write(str[i]);
    }
    return '${buffer.toString()} online';
  }

  Widget _buildMiniAvatar(String assetPath, Color borderColor, double leftOffset, int keyIndex) {
    return Positioned(
      left: leftOffset,
      child: AnimatedSwitcher(
        duration: const Duration(milliseconds: 600),
        switchInCurve: Curves.easeOutBack,
        switchOutCurve: Curves.easeIn,
        transitionBuilder: (child, animation) {
          return ScaleTransition(
            scale: animation,
            child: FadeTransition(opacity: animation, child: child),
          );
        },
        child: Container(
          key: ValueKey<String>('$keyIndex-$assetPath'),
          width: 24,
          height: 24,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            border: Border.all(color: borderColor, width: 1.5),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.4),
                blurRadius: 4,
              ),
            ],
          ),
          child: ClipOval(
            child: Image.asset(
              assetPath,
              width: 24,
              height: 24,
              fit: BoxFit.cover,
              errorBuilder: (context, error, stackTrace) => Container(
                color: borderColor,
              ),
            ),
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final formattedCount = (widget.onlineCount != null && widget.onlineCount!.isNotEmpty)
        ? widget.onlineCount!
        : _formatCount(_currentCount);

    return Container(
      width: double.infinity,
      height: 38,
      decoration: const BoxDecoration(
        gradient: AppColors.tickerGradient,
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          // Stacked Overlapping Mini Player Avatars with Dynamic Motion
          SizedBox(
            width: 56,
            height: 24,
            child: Stack(
              clipBehavior: Clip.none,
              children: [
                _buildMiniAvatar(_activeAvatars[0], _borderColors[0], 0, 0),
                _buildMiniAvatar(_activeAvatars[1], _borderColors[1], 15, 1),
                _buildMiniAvatar(_activeAvatars[2], _borderColors[2], 30, 2),
              ],
            ),
          ),
          const SizedBox(width: 10),

          // Dynamic Animated Counter Text with Slide & Fade Motion
          AnimatedSwitcher(
            duration: const Duration(milliseconds: 400),
            switchInCurve: Curves.easeOutCubic,
            switchOutCurve: Curves.easeInCubic,
            transitionBuilder: (Widget child, Animation<double> animation) {
              return SlideTransition(
                position: Tween<Offset>(
                  begin: const Offset(0.0, 0.35),
                  end: Offset.zero,
                ).animate(animation),
                child: FadeTransition(
                  opacity: animation,
                  child: child,
                ),
              );
            },
            child: Text(
              formattedCount,
              key: ValueKey<String>(formattedCount),
              style: GoogleFonts.poppins(
                color: Colors.white,
                fontSize: 15,
                fontWeight: FontWeight.w700,
                letterSpacing: 0.3,
              ),
            ),
          ),
          const SizedBox(width: 8),

          // Animated Pulsing Green Live Dot (Right Side)
          AnimatedBuilder(
            animation: _pulseAnimation,
            builder: (context, child) {
              return Container(
                width: 10,
                height: 10,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: AppColors.liveIndicator.withValues(alpha: _pulseAnimation.value),
                  boxShadow: [
                    BoxShadow(
                      color: AppColors.liveIndicator.withValues(alpha: _pulseAnimation.value),
                      blurRadius: 6,
                      spreadRadius: 2,
                    ),
                  ],
                ),
              );
            },
          ),
        ],
      ),
    );
  }
}
