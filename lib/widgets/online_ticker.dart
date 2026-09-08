import 'dart:async';
import 'dart:math';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../services/api_service.dart';
import '../services/dashboard_sync_manager.dart';
import '../theme/app_colors.dart';
import 'shimmer_loading.dart';

class OnlineTicker extends StatefulWidget {
  final String? onlineCount;
  final bool isLoading;

  const OnlineTicker({
    super.key,
    this.onlineCount,
    this.isLoading = false,
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

  int _currentCount = 89156;
  List<String> _allAvatars = [
    '/avatars/avatar_1.png',
    '/avatars/avatar_2.png',
    '/avatars/avatar_3.png',
    '/avatars/avatar_7.png',
    '/avatars/avatar_8.png',
    '/avatars/avatar_9.png',
  ];

  late List<String> _activeAvatars;
  List<Color> _borderColors = [
    Colors.amber,
    Colors.orangeAccent,
    Colors.lightBlueAccent,
  ];

  Color _parseHexColor(String hexString, Color fallback) {
    try {
      final buffer = StringBuffer();
      if (hexString.length == 6 || hexString.length == 7) buffer.write('ff');
      buffer.write(hexString.replaceFirst('#', ''));
      return Color(int.parse(buffer.toString(), radix: 16));
    } catch (_) {
      return fallback;
    }
  }

  @override
  void initState() {
    super.initState();
    _loadAvatarsFromSyncManager();

    _activeAvatars = [
      _allAvatars[0],
      _allAvatars[1],
      _allAvatars[2],
    ];

    DashboardSyncManager.dashboardData.addListener(_onDashboardDataChanged);

    _pulseController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1200),
    )..repeat(reverse: true);

    _pulseAnimation = Tween<double>(begin: 0.3, end: 1.0).animate(
      CurvedAnimation(parent: _pulseController, curve: Curves.easeInOut),
    );

    // Periodic dynamic update for count & continuously rotating all 6 avatars
    _updateTimer = Timer.periodic(const Duration(milliseconds: 3200), (timer) {
      if (!mounted) return;
      setState(() {
        final isIncrease = _random.nextDouble() > 0.3;
        final delta = isIncrease ? _random.nextInt(35) + 5 : -(_random.nextInt(18) + 2);
        _currentCount = (_currentCount + delta).clamp(85000, 99999);

        final replaceIndex = _random.nextInt(3);
        final unusedAvatars = _allAvatars.where((a) => !_activeAvatars.contains(a)).toList();
        if (unusedAvatars.isNotEmpty) {
          final newAvatar = unusedAvatars[_random.nextInt(unusedAvatars.length)];
          _activeAvatars[replaceIndex] = newAvatar;
        }
      });
    });
  }

  void _loadAvatarsFromSyncManager() {
    final data = DashboardSyncManager.dashboardData.value;
    final online = data['onlinePlayers'];
    if (online != null && online is Map<String, dynamic>) {
      if (online.containsKey('totalOnline') && online['totalOnline'] is num) {
        _currentCount = (online['totalOnline'] as num).toInt();
      }
      if (online['avatars'] is List) {
        final List<dynamic> list = online['avatars'];
        if (list.isNotEmpty) {
          final synced = list.map((e) => e.toString()).toList();
          if (synced.length >= 3) {
            _allAvatars = synced;
          }
        }
      }
      if (online['ringColors'] is List) {
        final List<dynamic> colorsList = online['ringColors'];
        if (colorsList.length >= 3) {
          _borderColors = [
            _parseHexColor(colorsList[0].toString(), Colors.amber),
            _parseHexColor(colorsList[1].toString(), Colors.orangeAccent),
            _parseHexColor(colorsList[2].toString(), Colors.lightBlueAccent),
          ];
        }
      }
    }
  }

  void _onDashboardDataChanged() {
    if (!mounted) return;
    setState(() {
      _loadAvatarsFromSyncManager();
    });
  }

  @override
  void dispose() {
    DashboardSyncManager.dashboardData.removeListener(_onDashboardDataChanged);
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

  Widget _buildAvatarImage(String path) {
    if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('/')) {
      final fullUrl = path.startsWith('/') ? '${ApiService.serverDomain}$path' : path;
      return Image.network(
        fullUrl,
        width: 24,
        height: 24,
        fit: BoxFit.cover,
        errorBuilder: (context, error, stackTrace) => Container(
          color: const Color(0xFF38084A),
          child: const Icon(Icons.person, size: 14, color: Colors.white70),
        ),
      );
    }

    final fileName = path.split('/').last.isEmpty ? 'avatar_1.png' : path.split('/').last;
    return Image.asset(
      'Assets/Avatar/$fileName',
      width: 24,
      height: 24,
      fit: BoxFit.cover,
      errorBuilder: (context, error, stackTrace) => Container(
        color: const Color(0xFF38084A),
        child: const Icon(Icons.person, size: 14, color: Colors.white70),
      ),
    );
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
            child: _buildAvatarImage(assetPath),
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (widget.isLoading) {
      return const Center(
        child: Padding(
          padding: EdgeInsets.symmetric(vertical: 2.0),
          child: ShimmerBox(
            width: 210,
            height: 28,
            borderRadius: 14.0,
          ),
        ),
      );
    }

    final formattedCount = _formatCount(_currentCount);

    return Center(
      child: CustomPaint(
        foregroundPainter: _TickerFadeBorderPainter(
          borderColor: const Color(0xFF5E177A),
          strokeWidth: 1.0,
        ),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 5),
          decoration: BoxDecoration(
            gradient: LinearGradient(
              colors: [
                const Color(0xFF38084A).withValues(alpha: 0.0),
                const Color(0xFF38084A).withValues(alpha: 0.6),
                const Color(0xFF38084A).withValues(alpha: 0.6),
                const Color(0xFF38084A).withValues(alpha: 0.0),
              ],
              stops: const [0.0, 0.15, 0.85, 1.0],
            ),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
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
        ),
      ),
    );
  }
}

class _TickerFadeBorderPainter extends CustomPainter {
  final Color borderColor;
  final double strokeWidth;

  _TickerFadeBorderPainter({
    required this.borderColor,
    this.strokeWidth = 1.5,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = strokeWidth;

    final lineShader = LinearGradient(
      colors: [
        borderColor.withValues(alpha: 0.0),
        borderColor.withValues(alpha: 0.25),
        borderColor.withValues(alpha: 0.25),
        borderColor.withValues(alpha: 0.0),
      ],
      stops: const [0.0, 0.15, 0.85, 1.0],
    ).createShader(Rect.fromLTWH(0, 0, size.width, size.height));

    paint.shader = lineShader;

    // Top fade line
    canvas.drawLine(Offset(0, strokeWidth / 2), Offset(size.width, strokeWidth / 2), paint);

    // Bottom fade line
    canvas.drawLine(Offset(0, size.height - strokeWidth / 2), Offset(size.width, size.height - strokeWidth / 2), paint);
  }

  @override
  bool shouldRepaint(covariant _TickerFadeBorderPainter oldDelegate) {
    return oldDelegate.borderColor != borderColor || oldDelegate.strokeWidth != strokeWidth;
  }
}
