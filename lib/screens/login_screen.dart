import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:url_launcher/url_launcher.dart';
import '../services/api_service.dart';
import 'html5_helper.dart';

enum LoginStep { selectMethod, waitingWhatsAppVerification }

class LoginScreen extends StatefulWidget {
  final ValueChanged<Map<String, dynamic>> onLoginSuccess;

  const LoginScreen({
    super.key,
    required this.onLoginSuccess,
  });

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  LoginStep _currentStep = LoginStep.selectMethod;
  bool _isLoading = false;
  String? _errorMessage;
  String? _statusMessage;

  String? _verificationLink;

  Future<void> _launchWhatsAppLink(String link) async {
    if (kIsWeb) {
      openExternalUrl(link);
      return;
    }

    final uri = Uri.parse(link);
    try {
      await launchUrl(
        uri,
        mode: LaunchMode.externalApplication,
      );
    } catch (_) {
      try {
        await launchUrl(
          uri,
          mode: LaunchMode.platformDefault,
        );
      } catch (_) {}
    }
  }

  Future<void> _handleLogginWhatsAppAuth() async {
    setState(() {
      _isLoading = true;
      _errorMessage = null;
      _statusMessage = 'Connecting to WhatsApp Verification...';
    });

    final res = await ApiService.createLogginToken();

    if (res != null && res['status'] == 'success' && res['data'] != null) {
      final token = res['data']['token'].toString();
      final link = res['data']['link'].toString();
      _verificationLink = link;

      await _launchWhatsAppLink(link);

      setState(() {
        _currentStep = LoginStep.waitingWhatsAppVerification;
        _statusMessage = 'Please send the pre-filled verification message on WhatsApp.\nWaiting for server confirmation... (Expires in 5 mins)';
      });

      // Perform server-side Loggin SDK verification (never trust client phone)
      final verifyRes = await ApiService.verifyLogginToken(token: token);

      if (!mounted) return;

      setState(() {
        _isLoading = false;
      });

      if (verifyRes != null && verifyRes['status'] == 'success' && verifyRes['token'] != null) {
        widget.onLoginSuccess(verifyRes);
      } else {
        setState(() {
          _currentStep = LoginStep.selectMethod;
          _errorMessage = verifyRes?['message'] ?? 'WhatsApp verification expired or failed. Tap button below to try again.';
          _statusMessage = null;
        });
      }
    } else {
      setState(() {
        _isLoading = false;
        _errorMessage = res?['message'] ?? 'Failed to initialize WhatsApp Verification. Check server connection.';
        _statusMessage = null;
      });
    }
  }

  Widget _buildWhatsAppIcon({double size = 28}) {
    return SvgPicture.asset(
      'Assets/whatsapp-svgrepo-com.svg',
      width: size,
      height: size,
    );
  }

  Widget _buildTopHeaderBar({VoidCallback? onBackTap}) {
    return Row(
      children: [
        if (onBackTap != null)
          GestureDetector(
            onTap: onBackTap,
            child: Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.1),
                shape: BoxShape.circle,
              ),
              child: const Icon(Icons.arrow_back_ios_new_rounded, color: Colors.white, size: 18),
            ),
          )
        else
          const SizedBox(width: 34),
        const Spacer(),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
          decoration: BoxDecoration(
            color: const Color(0xFF25D366).withValues(alpha: 0.15),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: const Color(0xFF25D366).withValues(alpha: 0.3)),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.security_rounded, color: Color(0xFF25D366), size: 14),
              const SizedBox(width: 4),
              Text(
                'Loggin Passwordless WA',
                style: GoogleFonts.poppins(
                  color: const Color(0xFF25D366),
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0D1520),
      body: SafeArea(
        child: AnimatedSwitcher(
          duration: const Duration(milliseconds: 300),
          child: _currentStep == LoginStep.selectMethod
              ? _buildSelectMethodView()
              : _buildWaitingVerificationView(),
        ),
      ),
    );
  }

  Widget _buildSelectMethodView() {
    return Column(
      key: const ValueKey('step_select_method'),
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.all(20.0),
          child: _buildTopHeaderBar(onBackTap: null),
        ),

        const Spacer(),

        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 28.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _buildWhatsAppIcon(size: 48),
              const SizedBox(height: 16),
              Text(
                'Welcome to InGames',
                style: GoogleFonts.poppins(
                  color: Colors.white,
                  fontSize: 32,
                  fontWeight: FontWeight.w800,
                  letterSpacing: -0.5,
                ),
              ),
              const SizedBox(height: 6),
              Text(
                'Verify via WhatsApp passwordless authentication (No OTP required)',
                style: GoogleFonts.poppins(
                  color: Colors.white70,
                  fontSize: 14,
                  fontWeight: FontWeight.w400,
                ),
              ),
            ],
          ),
        ),

        const SizedBox(height: 28),

        if (_statusMessage != null)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 28.0, vertical: 8.0),
            child: Text(
              _statusMessage!,
              style: GoogleFonts.poppins(
                color: const Color(0xFF25D366),
                fontSize: 13.5,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),

        if (_errorMessage != null)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 28.0, vertical: 8.0),
            child: Text(
              _errorMessage!,
              style: GoogleFonts.poppins(
                color: const Color(0xFFFF5252),
                fontSize: 13,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),

        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24.0),
          child: GestureDetector(
            onTap: _isLoading ? null : _handleLogginWhatsAppAuth,
            child: Container(
              height: 60,
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  colors: [
                    Color(0xFF25D366),
                    Color(0xFF128C7E),
                  ],
                ),
                borderRadius: BorderRadius.circular(30),
                boxShadow: [
                  BoxShadow(
                    color: const Color(0xFF25D366).withValues(alpha: 0.35),
                    blurRadius: 20,
                    offset: const Offset(0, 8),
                  ),
                ],
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  if (_isLoading)
                    const SizedBox(
                      width: 24,
                      height: 24,
                      child: CircularProgressIndicator(
                        strokeWidth: 2.5,
                        color: Colors.white,
                      ),
                    )
                  else ...[
                    _buildWhatsAppIcon(size: 28),
                    const SizedBox(width: 14),
                    Text(
                      'Verify via WhatsApp',
                      style: GoogleFonts.poppins(
                        color: Colors.white,
                        fontSize: 17,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),

        const SizedBox(height: 48),
      ],
    );
  }

  Widget _buildWaitingVerificationView() {
    return Column(
      key: const ValueKey('step_waiting_verification'),
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        Padding(
          padding: const EdgeInsets.all(20.0),
          child: _buildTopHeaderBar(
            onBackTap: () => setState(() => _currentStep = LoginStep.selectMethod),
          ),
        ),

        const Spacer(),

        Container(
          width: 90,
          height: 90,
          decoration: BoxDecoration(
            color: const Color(0xFF25D366).withValues(alpha: 0.15),
            shape: BoxShape.circle,
            border: Border.all(color: const Color(0xFF25D366), width: 2),
          ),
          child: Center(
            child: _buildWhatsAppIcon(size: 48),
          ),
        ),

        const SizedBox(height: 24),

        Text(
          'Waiting for WhatsApp Verification...',
          style: GoogleFonts.poppins(
            color: Colors.white,
            fontSize: 20,
            fontWeight: FontWeight.w700,
          ),
        ),

        const SizedBox(height: 12),

        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 36.0),
          child: Text(
            'Please tap "Send" in WhatsApp to confirm your number.\nThis window will automatically proceed once verified.',
            textAlign: TextAlign.center,
            style: GoogleFonts.poppins(
              color: Colors.white70,
              fontSize: 14,
              height: 1.4,
            ),
          ),
        ),

        const SizedBox(height: 24),

        if (_verificationLink != null)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 40.0),
            child: ElevatedButton.icon(
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF25D366),
                foregroundColor: Colors.white,
                minimumSize: const Size(double.infinity, 48),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(24),
                ),
              ),
              onPressed: () => _launchWhatsAppLink(_verificationLink!),
              icon: _buildWhatsAppIcon(size: 22),
              label: Text(
                'Open WhatsApp Now',
                style: GoogleFonts.poppins(
                  fontSize: 15,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ),

        const SizedBox(height: 20),

        const CircularProgressIndicator(
          color: Color(0xFF25D366),
          strokeWidth: 3,
        ),

        const Spacer(),

        TextButton(
          onPressed: () => setState(() => _currentStep = LoginStep.selectMethod),
          child: Text(
            'Cancel Verification',
            style: GoogleFonts.poppins(
              color: Colors.white54,
              fontSize: 14,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),

        const SizedBox(height: 32),
      ],
    );
  }
}
