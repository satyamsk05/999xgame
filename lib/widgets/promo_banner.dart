import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../theme/app_colors.dart';
import '../services/api_service.dart';
import '../services/dashboard_sync_manager.dart';
import '../widgets/shimmer_loading.dart';

class PromoBanner extends StatelessWidget {
  final VoidCallback onTap;

  const PromoBanner({
    super.key,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<bool>(
      valueListenable: DashboardSyncManager.isSyncing,
      builder: (context, syncing, child) {
        return ValueListenableBuilder<Map<String, dynamic>>(
          valueListenable: DashboardSyncManager.dashboardData,
          builder: (context, data, child) {
            final banners = data['banners'] as List<dynamic>? ?? [];

            if (syncing && banners.isEmpty) {
              return Container(
                margin: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 8.0),
                child: const ShimmerBox(
                  width: double.infinity,
                  height: 175,
                  borderRadius: 16.0,
                ),
              );
            }

            final bannerObj = (banners.isNotEmpty && banners[0] is Map<String, dynamic>)
                ? banners[0] as Map<String, dynamic>
                : <String, dynamic>{};

            final tag = bannerObj['tag']?.toString() ?? 'DEPOSIT';
            final title = bannerObj['title']?.toString() ?? 'DEPOSIT BONUS\n180% BONUS';
            final subtitle = bannerObj['subtitle']?.toString() ?? 'DEPOSIT -> GET BONUS';
            final buttonText = bannerObj['buttonText']?.toString() ?? 'DEPOSIT NOW';

            return GestureDetector(
              onTap: onTap,
              child: Container(
                height: 175,
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
                          padding: const EdgeInsets.fromLTRB(16, 10, 8, 10),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  mainAxisAlignment: MainAxisAlignment.center,
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
                                        tag,
                                        style: GoogleFonts.poppins(
                                          color: const Color(0xFFCAA772),
                                          fontSize: 10,
                                          fontWeight: FontWeight.w800,
                                          letterSpacing: 0.5,
                                        ),
                                      ),
                                    ),
                                    const SizedBox(height: 4),
                                    FittedBox(
                                      fit: BoxFit.scaleDown,
                                      alignment: Alignment.centerLeft,
                                      child: Text(
                                        title,
                                        style: GoogleFonts.poppins(
                                          color: Colors.white,
                                          fontSize: 14.5,
                                          fontWeight: FontWeight.w900,
                                          height: 1.15,
                                        ),
                                      ),
                                    ),
                                    const SizedBox(height: 2),
                                    Text(
                                      subtitle,
                                      style: GoogleFonts.poppins(
                                        color: const Color(0xFFCAA772),
                                        fontSize: 10,
                                        fontWeight: FontWeight.w700,
                                        letterSpacing: 0.2,
                                      ),
                                    ),
                                  ],
                                ),
                              ),

                              const SizedBox(height: 6),

                              // Clean DEPOSIT NOW Action Button
                              Container(
                                width: 135,
                                height: 32,
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
                                    buttonText,
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
                        padding: const EdgeInsets.only(top: 4, bottom: 4, right: 6),
                        child: Image.network(
                          (bannerObj['imageUrl'] != null && bannerObj['imageUrl'].toString().isNotEmpty)
                              ? (bannerObj['imageUrl'].toString().startsWith('/')
                                  ? '${ApiService.serverDomain}${bannerObj['imageUrl']}'
                                  : bannerObj['imageUrl'].toString())
                              : '${ApiService.serverDomain}/banners/banner.png',
                          height: 160,
                          fit: BoxFit.contain,
                          alignment: Alignment.centerRight,
                          frameBuilder: (context, child, frame, wasSynchronouslyLoaded) {
                            if (wasSynchronouslyLoaded || frame != null) return child;
                            return const ShimmerBox(width: 140, height: 140, borderRadius: 12);
                          },
                          errorBuilder: (context, error, stackTrace) => Image.asset(
                            'Assets/banner.png',
                            height: 160,
                            fit: BoxFit.contain,
                            alignment: Alignment.centerRight,
                            errorBuilder: (context, error, stackTrace) => const SizedBox(),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            );
          },
        );
      },
    );
  }
}