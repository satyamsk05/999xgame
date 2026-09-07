import 'package:flutter/material.dart';

/// Wraps the application in a sleek 1080x2400 mobile device frame when viewed on desktop or web browser.
class MobileDeviceFrame extends StatelessWidget {
  final Widget child;

  const MobileDeviceFrame({
    super.key,
    required this.child,
  });

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        // If resolution is wider than 550px (Web browser or Desktop window)
        if (constraints.maxWidth > 550) {
          // Compute frame dimensions matching 1080 x 2400 aspect ratio (9:20)
          final double targetHeight = (constraints.maxHeight * 0.94).clamp(750.0, 960.0);
          final double targetWidth = targetHeight * (1080 / 2400); // 1080 x 2400 aspect ratio

          return Scaffold(
            backgroundColor: const Color(0xFF090112),
            body: Center(
              child: Container(
                width: targetWidth,
                height: targetHeight,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(44),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.purple.shade900.withValues(alpha: 0.5),
                      blurRadius: 30,
                      spreadRadius: 5,
                    ),
                    BoxShadow(
                      color: Colors.black.withValues(alpha: 0.8),
                      blurRadius: 20,
                      offset: const Offset(0, 10),
                    ),
                  ],
                ),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(44),
                  child: Container(
                    decoration: BoxDecoration(
                      border: Border.all(
                        color: const Color(0xFF3F1054),
                        width: 10,
                      ),
                      borderRadius: BorderRadius.circular(44),
                    ),
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(34),
                      child: Stack(
                        children: [
                          // Background fill for device viewport matching app theme background
                          Positioned.fill(
                            child: Container(
                              color: const Color(0xFF1F0130),
                            ),
                          ),

                          // Main 1080x2400 App Viewport (Pushed down slightly below status bar)
                          Positioned(
                            top: 36,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            child: child,
                          ),

                          // Top Mobile Status Bar (Clock, 5G, Battery)
                          Positioned(
                            top: 0,
                            left: 0,
                            right: 0,
                            child: Container(
                              height: 36,
                              padding: const EdgeInsets.symmetric(horizontal: 24),
                              color: Colors.transparent,
                              child: Row(
                                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                children: [
                                  const Text(
                                    '16:09',
                                    style: TextStyle(
                                      color: Colors.white,
                                      fontSize: 12,
                                      fontWeight: FontWeight.bold,
                                    ),
                                  ),
                                  // Top Camera Notch / Dynamic Island
                                  Container(
                                    width: 90,
                                    height: 18,
                                    decoration: BoxDecoration(
                                      color: Colors.black,
                                      borderRadius: BorderRadius.circular(12),
                                    ),
                                  ),
                                  const Row(
                                    children: [
                                      Icon(Icons.wifi, color: Colors.white, size: 14),
                                      SizedBox(width: 4),
                                      Icon(Icons.battery_5_bar_rounded, color: Colors.white, size: 14),
                                    ],
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ),
          );
        }

        // On real mobile screens, display edge-to-edge
        return child;
      },
    );
  }
}
