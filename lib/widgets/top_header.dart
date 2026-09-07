import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:google_fonts/google_fonts.dart';
import '../theme/app_colors.dart';

class TopHeader extends StatelessWidget {
  final String username;
  final String userTag;
  final double balance;
  final String avatarPath;
  final VoidCallback onAddMoneyPressed;
  final VoidCallback onProfilePressed;

  const TopHeader({
    super.key,
    this.username = 'Player',
    this.userTag = 'Profile',
    this.balance = 0.0,
    this.avatarPath = 'assets/avatar/avatar_1.png',
    required this.onAddMoneyPressed,
    required this.onProfilePressed,
  });

  @override
  Widget build(BuildContext context) {
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
                  color: AppColors.avatarBorder,
                  width: 2.0,
                ),
                boxShadow: [
                  BoxShadow(
                    color: AppColors.avatarBorder.withValues(alpha: 0.4),
                    blurRadius: 10,
                    spreadRadius: 1,
                  ),
                ],
              ),
              child: ClipOval(
                child: Image.asset(
                  avatarPath,
                  width: 60,
                  height: 60,
                  fit: BoxFit.cover,
                  errorBuilder: (context, error, stackTrace) => Center(
                    child: Icon(
                      Icons.person,
                      size: 38,
                      color: Colors.purple.shade900,
                    ),
                  ),
                ),
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
                      color: const Color(0xFF3B0A4E),
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
                          'Profile',
                          style: GoogleFonts.poppins(
                            color: const Color(0xFFFFD700),
                            fontSize: 10,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        const SizedBox(width: 2),
                        const Icon(
                          Icons.play_arrow_rounded,
                          color: Color(0xFFFFD700),
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
                  gradient: const LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [
                      Color(0xFF00D294),
                      Color(0xFF00A574),
                    ],
                  ),
                  borderRadius: BorderRadius.circular(12),
                  boxShadow: [
                    BoxShadow(
                      color: const Color(0xFF00A574).withValues(alpha: 0.5),
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
                      'assets/nav_icon/wallet.svg',
                      width: 22,
                      height: 22,
                      colorFilter: const ColorFilter.mode(Colors.white, BlendMode.srcIn),
                    ),
                    const SizedBox(width: 8),

                    // Balance Text
                    Text(
                      '₹${balance.toInt()}',
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

                    // Plus Sign (+)
                    Text(
                      '+',
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
}
