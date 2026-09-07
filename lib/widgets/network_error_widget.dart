import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

class NetworkErrorWidget extends StatefulWidget {
  final VoidCallback onRetry;
  final String? customTitle;
  final String? customMessage;

  const NetworkErrorWidget({
    super.key,
    required this.onRetry,
    this.customTitle,
    this.customMessage,
  });

  @override
  State<NetworkErrorWidget> createState() => _NetworkErrorWidgetState();
}

class _NetworkErrorWidgetState extends State<NetworkErrorWidget> {
  bool _isRetrying = false;

  Future<void> _handleRetry() async {
    if (_isRetrying) return;
    setState(() {
      _isRetrying = true;
    });
    await Future.delayed(const Duration(milliseconds: 400));
    widget.onRetry();
    if (mounted) {
      setState(() {
        _isRetrying = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      height: double.infinity,
      color: const Color(0xFF130221),
      padding: const EdgeInsets.symmetric(horizontal: 32),
      child: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            // Muted Info Icon Circle
            Container(
              width: 72,
              height: 72,
              decoration: const BoxDecoration(
                color: Color(0xFF7A6B94),
                shape: BoxShape.circle,
              ),
              child: const Center(
                child: Icon(
                  Icons.info_rounded,
                  color: Color(0xFF130221),
                  size: 46,
                ),
              ),
            ),
            const SizedBox(height: 28),

            // Main Title
            Text(
              widget.customTitle ?? "Couldn't Load",
              textAlign: TextAlign.center,
              style: GoogleFonts.poppins(
                color: Colors.white,
                fontSize: 21,
                fontWeight: FontWeight.w700,
                letterSpacing: 0.2,
              ),
            ),
            const SizedBox(height: 10),

            // Subtitle Description
            Text(
              widget.customMessage ?? "There was a problem trying to load the\nscreen",
              textAlign: TextAlign.center,
              style: GoogleFonts.poppins(
                color: const Color(0xFF9E92B3),
                fontSize: 13.5,
                fontWeight: FontWeight.w400,
                height: 1.4,
              ),
            ),
            const SizedBox(height: 32),

            // TRY AGAIN Button
            SizedBox(
              width: 220,
              height: 48,
              child: ElevatedButton(
                onPressed: _isRetrying ? null : _handleRetry,
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.white,
                  foregroundColor: const Color(0xFF4C1D95),
                  elevation: 0,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(10),
                  ),
                ),
                child: _isRetrying
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(
                          strokeWidth: 2.5,
                          color: Color(0xFF4C1D95),
                        ),
                      )
                    : Text(
                        'TRY AGAIN',
                        style: GoogleFonts.poppins(
                          fontSize: 14,
                          fontWeight: FontWeight.w800,
                          letterSpacing: 0.6,
                          color: const Color(0xFF4C1D95),
                        ),
                      ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
