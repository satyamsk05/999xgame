import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:google_fonts/google_fonts.dart';
import '../services/api_service.dart';
import '../theme/app_colors.dart';
import 'shimmer_loading.dart';

class TopHeader extends StatelessWidget {
  final String username;
  final String userTag;
  final double balance;
  final String avatarPath;
  final VoidCallback onAddMoneyPressed;
  final VoidCallback onProfilePressed;
  final bool isLoading;

  // Server-driven theme values
  final Color ringColor;
  final Color profileTagColor;
  final Color profileTagBg;
  final Color walletGradientStart;
  final Color walletGradientEnd;
  final String currencySymbol;
  final String addCashLabel;

  const TopHeader({
    super.key,
    this.username = 'Ashu K',
    this.userTag = 'Profile',
    this.balance = 1250.0,
    this.avatarPath = '/avatars/avatar_1.png',
    required this.onAddMoneyPressed,
    required this.onProfilePressed,
    this.isLoading = false,
    this.ringColor = const Color(0xFFE1B219),
    this.profileTagColor = const Color(0xFFFFD700),
    this.profileTagBg = const Color(0xFF3B0A4E),
    this.walletGradientStart = const Color(0xFF00D294),
    this.walletGradientEnd = const Color(0xFF00A574),
    this.currencySymbol = '₹',
    this.addCashLabel = '+',
  });

  static String _cleanPath(String? p) {
    if (p == null || p.isEmpty) return '/avatars/avatar_1.png';
    return p;
  }

  @override
  Widget build(BuildContext context) {
    if (isLoading) {
      return Container(
        padding: const EdgeInsets.only(top: 18.0, bottom: 12.0, left: 16.0, right: 16.0),
        child: const Row(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            ShimmerBox(width: 58, height: 58, borderRadius: 29),
            SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  ShimmerBox(width: 110, height: 16, borderRadius: 8),
                  SizedBox(height: 6),
                  ShimmerBox(width: 60, height: 14, borderRadius: 6),
                ],
              ),
            ),
            ShimmerBox(width: 135, height: 42, borderRadius: 12),
          ],
        ),
      );
    }

    final cleanAvatarPath = _cleanPath(avatarPath);

    return Container(
      padding: const EdgeInsets.only(top: 18.0, bottom: 12.0, left: 16.0, right: 16.0),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          // Profile Avatar with Gold Border
          GestureDetector(
            onTap: onProfilePressed,
            child: Container(
              width: 60,
              height: 60,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: AppColors.avatarBg,
                border: Border.all(
                  color: ringColor,
                  width: 2.0,
                ),
                boxShadow: [
                  BoxShadow(
                    color: ringColor.withValues(alpha: 0.4),
                    blurRadius: 10,
                    spreadRadius: 1,
                  ),
                ],
              ),
              child: ClipOval(
                child: _buildAvatarWithCandidates(cleanAvatarPath),
              ),
            ),
          ),
          const SizedBox(width: 14),

          // User Info (Name + Profile Tag)
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  username,
                  style: GoogleFonts.poppins(
                    color: AppColors.profileName,
                    fontSize: 17,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 0.2,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 2),
                GestureDetector(
                  onTap: onProfilePressed,
                  child: Container(
                    margin: const EdgeInsets.only(top: 2),
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                    decoration: BoxDecoration(
                      color: profileTagBg,
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(
                        color: Colors.white.withValues(alpha: 0.15),
                        width: 1,
                      ),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          userTag,
                          style: GoogleFonts.poppins(
                            color: profileTagColor,
                            fontSize: 10,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        const SizedBox(width: 2),
                        Icon(
                          Icons.play_arrow_rounded,
                          color: profileTagColor,
                          size: 9.5,
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),

          // Green Capsule Wallet Button matching user screenshot (Wallet icon + ₹Balance | +)
          Material(
            color: Colors.transparent,
            child: InkWell(
              onTap: onAddMoneyPressed,
              borderRadius: BorderRadius.circular(12),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [
                      walletGradientStart,
                      walletGradientEnd,
                    ],
                  ),
                  borderRadius: BorderRadius.circular(12),
                  boxShadow: [
                    BoxShadow(
                      color: walletGradientEnd.withValues(alpha: 0.5),
                      blurRadius: 10,
                      offset: const Offset(0, 4),
                    ),
                  ],
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.center,
                  children: [
                    // Left Wallet Icon
                    SvgPicture.asset(
                      'Assets/nav_icon/wallet.svg',
                      width: 22,
                      height: 22,
                      colorFilter: const ColorFilter.mode(Colors.white, BlendMode.srcIn),
                    ),
                    const SizedBox(width: 8),

                    // Balance Text
                    Text(
                      '$currencySymbol${balance.toInt()}',
                      style: GoogleFonts.inter(
                        color: Colors.white,
                        fontSize: 17,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 0.3,
                      ),
                    ),

                    const SizedBox(width: 10),

                    // Vertical Separator Line
                    Container(
                      width: 1,
                      height: 18,
                      color: Colors.white.withValues(alpha: 0.35),
                    ),

                    const SizedBox(width: 10),

                    // Add Cash Label
                    Text(
                      addCashLabel,
                      style: GoogleFonts.poppins(
                        color: Colors.white,
                        fontSize: 18,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildAvatarWithCandidates(String primaryPath) {
    if (primaryPath.startsWith('http://') || primaryPath.startsWith('https://') || primaryPath.startsWith('/')) {
      final fullUrl = primaryPath.startsWith('/') ? '${ApiService.serverDomain}$primaryPath' : primaryPath;
      return Image.network(
        fullUrl,
        width: 60,
        height: 60,
        fit: BoxFit.cover,
        frameBuilder: (context, child, frame, wasSynchronouslyLoaded) {
          if (wasSynchronouslyLoaded || frame != null) return child;
          return const ShimmerBox(width: 60, height: 60, borderRadius: 30);
        },
        errorBuilder: (context, error, stackTrace) => Container(
          color: AppColors.avatarBg,
          child: const Icon(Icons.person, color: Colors.white70, size: 36),
        ),
      );
    }

    final fileName = primaryPath.split('/').last.isEmpty ? 'avatar_1.png' : primaryPath.split('/').last;
    return Image.asset(
      'Assets/Avatar/$fileName',
      width: 60,
      height: 60,
      fit: BoxFit.cover,
      errorBuilder: (context, error, stackTrace) => Container(
        color: AppColors.avatarBg,
        child: const Icon(Icons.person, color: Colors.white70, size: 36),
      ),
    );
  }

}
