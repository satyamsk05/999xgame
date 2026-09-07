import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

class InAppUpdateDialog extends StatefulWidget {
  final String version;
  final VoidCallback? onInstallPressed;

  const InAppUpdateDialog({
    super.key,
    this.version = 'v2.0.0',
    this.onInstallPressed,
  });

  static Future<void> show(BuildContext context, {VoidCallback? onInstallPressed}) {
    return showDialog(
      context: context,
      barrierDismissible: true,
      builder: (context) => InAppUpdateDialog(onInstallPressed: onInstallPressed),
    );
  }

  @override
  State<InAppUpdateDialog> createState() => _InAppUpdateDialogState();
}

class _InAppUpdateDialogState extends State<InAppUpdateDialog>
    with SingleTickerProviderStateMixin {
  late AnimationController _downloadController;
  late Animation<double> _progressAnimation;

  @override
  void initState() {
    super.initState();
    _downloadController = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 4),
    );

    _progressAnimation = Tween<double>(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(parent: _downloadController, curve: Curves.easeInOut),
    )..addListener(() {
        setState(() {});
      });

    // Start real-time downloading simulation
    _downloadController.forward();
  }

  @override
  void dispose() {
    _downloadController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final double progress = _progressAnimation.value;
    final bool isFinished = progress >= 1.0;
    final int percentage = (progress * 100).toInt();

    return Dialog(
      backgroundColor: Colors.transparent,
      insetPadding: const EdgeInsets.symmetric(horizontal: 24, vertical: 40),
      child: Stack(
        alignment: Alignment.topCenter,
        clipBehavior: Clip.none,
        children: [
          // Main Dialog Card
          Container(
            width: double.infinity,
            padding: const EdgeInsets.fromLTRB(20, 24, 20, 20),
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [
                  Color(0xFF6C20E0),
                  Color(0xFF2C0240),
                ],
              ),
              borderRadius: BorderRadius.circular(28),
              border: Border.all(
                color: const Color(0xFFAB47BC).withValues(alpha: 0.6),
                width: 1.5,
              ),
              boxShadow: [
                BoxShadow(
                  color: Colors.purple.shade900.withValues(alpha: 0.7),
                  blurRadius: 24,
                  offset: const Offset(0, 8),
                ),
              ],
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                // Top Right Spinner / Cancel button
                Align(
                  alignment: Alignment.topRight,
                  child: GestureDetector(
                    onTap: () => Navigator.of(context).pop(),
                    child: Container(
                      width: 32,
                      height: 32,
                      alignment: Alignment.center,
                      padding: const EdgeInsets.all(4),
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: Colors.white.withValues(alpha: 0.15),
                      ),
                      child: isFinished
                          ? const Icon(
                              Icons.close_rounded,
                              color: Colors.white,
                              size: 18,
                            )
                          : const SizedBox(
                              width: 18,
                              height: 18,
                              child: CircularProgressIndicator(
                                strokeWidth: 2.2,
                                valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                              ),
                            ),
                    ),
                  ),
                ),

                const SizedBox(height: 10),

                // Phone Frame Illustration Container
                Container(
                  width: 220,
                  height: 240,
                  decoration: BoxDecoration(
                    color: const Color(0xFF531191),
                    borderRadius: BorderRadius.circular(32),
                    border: Border.all(
                      color: Colors.purpleAccent.withValues(alpha: 0.3),
                      width: 2,
                    ),
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withValues(alpha: 0.4),
                        blurRadius: 16,
                        offset: const Offset(0, 6),
                      ),
                    ],
                  ),
                  child: Stack(
                    alignment: Alignment.center,
                    children: [
                      // Purple Glowing rays background
                      Positioned.fill(
                        child: Container(
                          decoration: BoxDecoration(
                            borderRadius: BorderRadius.circular(32),
                            gradient: RadialGradient(
                              colors: [
                                const Color(0xFF9C27B0).withValues(alpha: 0.4),
                                Colors.transparent,
                              ],
                              radius: 0.8,
                            ),
                          ),
                        ),
                      ),

                      // Gift Box Graphic Icon
                      Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          const SizedBox(height: 10),
                          Container(
                            padding: const EdgeInsets.all(14),
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              color: const Color(0xFF9C27B0),
                              boxShadow: [
                                BoxShadow(
                                  color: const Color(0xFFE040FB).withValues(alpha: 0.5),
                                  blurRadius: 16,
                                ),
                              ],
                            ),
                            child: const Icon(
                              Icons.card_giftcard_rounded,
                              color: Color(0xFFFFD700),
                              size: 48,
                            ),
                          ),
                          const SizedBox(height: 20),

                          // Ribbon Tag: NEW UPDATE
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 6),
                            decoration: BoxDecoration(
                              gradient: const LinearGradient(
                                colors: [
                                  Color(0xFFFFB300),
                                  Color(0xFFFF8F00),
                                ],
                              ),
                              borderRadius: BorderRadius.circular(20),
                              boxShadow: [
                                BoxShadow(
                                  color: Colors.amber.shade900.withValues(alpha: 0.5),
                                  blurRadius: 8,
                                  offset: const Offset(0, 3),
                                ),
                              ],
                            ),
                            child: Text(
                              'NEW UPDATE',
                              style: GoogleFonts.poppins(
                                color: Colors.black87,
                                fontSize: 14,
                                fontWeight: FontWeight.w900,
                                letterSpacing: 0.8,
                              ),
                            ),
                          ),

                          const SizedBox(height: 12),

                          // Downloaded text percentage
                          Text(
                            '$percentage% Downloaded',
                            style: GoogleFonts.poppins(
                              color: Colors.white,
                              fontSize: 13,
                              fontWeight: FontWeight.w700,
                            ),
                          ),

                          const SizedBox(height: 8),

                          // Green Dynamic Progress Bar
                          Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 24),
                            child: ClipRRect(
                              borderRadius: BorderRadius.circular(10),
                              child: LinearProgressIndicator(
                                value: progress,
                                minHeight: 6,
                                backgroundColor: Colors.white24,
                                valueColor: const AlwaysStoppedAnimation<Color>(
                                  Color(0xFF00E676),
                                ),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),

                const SizedBox(height: 24),

                // Button: Action depends on completion state
                SizedBox(
                  width: double.infinity,
                  height: 52,
                  child: ElevatedButton(
                    onPressed: () {
                      if (!isFinished) {
                        Navigator.of(context).pop();
                      } else {
                        Navigator.of(context).pop();
                        if (widget.onInstallPressed != null) {
                          widget.onInstallPressed!();
                        } else {
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(
                              content: Text(
                                'Starting application installation... 🚀',
                                style: GoogleFonts.poppins(),
                              ),
                              backgroundColor: const Color(0xFF00E676),
                              behavior: SnackBarBehavior.floating,
                            ),
                          );
                        }
                      }
                    },
                    style: ElevatedButton.styleFrom(
                      backgroundColor: isFinished ? const Color(0xFF00E676) : Colors.white12,
                      foregroundColor: isFinished ? Colors.black : Colors.white,
                      elevation: isFinished ? 8 : 0,
                      shadowColor: isFinished
                          ? const Color(0xFF00E676).withValues(alpha: 0.5)
                          : Colors.transparent,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(16),
                      ),
                    ),
                    child: Text(
                      isFinished ? 'INSTALL NOW' : 'CANCEL ($percentage%)',
                      style: GoogleFonts.poppins(
                        fontSize: 15,
                        fontWeight: FontWeight.w900,
                        letterSpacing: 1.0,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),

          // Glowing top badge icon
          Positioned(
            top: -20,
            child: Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: const Color(0xFF9C27B0),
                border: Border.all(color: Colors.white, width: 2),
                boxShadow: [
                  BoxShadow(
                    color: Colors.purple.withValues(alpha: 0.6),
                    blurRadius: 12,
                  ),
                ],
              ),
              child: Icon(
                isFinished ? Icons.check_circle_rounded : Icons.downloading_rounded,
                color: const Color(0xFF00E676),
                size: 26,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
