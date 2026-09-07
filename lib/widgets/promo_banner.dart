import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../theme/app_colors.dart';
import '../services/api_service.dart';

class PromoBanner extends StatelessWidget {
  final VoidCallback onTap;

  const PromoBanner({
    super.key,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        height: 165,
        margin: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 8.0),
        decoration: BoxDecoration(
          gradient: const LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [
              Color(0xFF2E0943),
              Color(0xFF160324),
            ],
          ),
          borderRadius: BorderRadius.circular(16.0),
          border: Border.all(
            color: AppColors.cardBorder,
            width: 2.0,
          ),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.4),
              blurRadius: 16,
              offset: const Offset(0, 6),
            ),
          ],
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(14.0),
          child: Row(
            children: [
              // Left Column: DEPOSIT Tag, Text Content & Clean DEPOSIT NOW Outlined Button
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 14, 8, 14),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          // DEPOSIT Tag
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 10,
                              vertical: 3,
                            ),
                            decoration: BoxDecoration(
                              color: const Color(0xFF4F106D),
                              borderRadius: BorderRadius.circular(6),
                              border: Border.all(
                                color: const Color(0xFFCAA772).withValues(alpha: 0.5),
                                width: 1,
                              ),
                            ),
                            child: Text(
                              'DEPOSIT',
                              style: GoogleFonts.poppins(
                                color: const Color(0xFFCAA772),
                                fontSize: 10,
                                fontWeight: FontWeight.w800,
                                letterSpacing: 0.5,
                              ),
                            ),
                          ),
                          const SizedBox(height: 6),
                          Text(
                            'DEPOSIT BONUS\n180% BONUS',
                            style: GoogleFonts.poppins(
                              color: Colors.white,
                              fontSize: 14.5,
                              fontWeight: FontWeight.w900,
                              height: 1.15,
                            ),
                          ),
                          const SizedBox(height: 3),
                          Text(
                            'DEPOSIT -> GET BONUS',
                            style: GoogleFonts.poppins(
                              color: const Color(0xFFCAA772),
                              fontSize: 10.5,
                              fontWeight: FontWeight.w700,
                              letterSpacing: 0.2,
                            ),
                          ),
                        ],
                      ),

                      // Clean DEPOSIT NOW Action Button (No white background, green theme gradient)
                      Container(
                        width: 140,
                        height: 34,
                        decoration: BoxDecoration(
                          gradient: const LinearGradient(
                            begin: Alignment.topCenter,
                            end: Alignment.bottomCenter,
                            colors: [
                              Color(0xFF00D294),
                              Color(0xFF00A574),
                            ],
                          ),
                          borderRadius: BorderRadius.circular(10),
                          boxShadow: [
                            BoxShadow(
                              color: const Color(0xFF00A574).withValues(alpha: 0.4),
                              blurRadius: 8,
                              offset: const Offset(0, 3),
                            ),
                          ],
                        ),
                        child: Center(
                          child: Text(
                            'DEPOSIT NOW',
                            style: GoogleFonts.poppins(
                              color: Colors.white,
                              fontSize: 11,
                              fontWeight: FontWeight.w800,
                              letterSpacing: 0.5,
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),

              // Right Side Banner Image Graphic (banner.png)
              Padding(
                padding: const EdgeInsets.only(top: 6, bottom: 6, right: 6),
                child: Image.network(
                  '${ApiService.serverDomain}/banners/banner.png',
                  height: 153,
                  fit: BoxFit.contain,
                  alignment: Alignment.centerRight,
                  errorBuilder: (context, error, stackTrace) {
                    return Image.asset(
                      'banner.png',
                      height: 153,
                      fit: BoxFit.contain,
                      alignment: Alignment.centerRight,
                    );
                  },
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}