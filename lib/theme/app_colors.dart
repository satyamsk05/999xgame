import 'package:flutter/material.dart';

class AppColors {
  // Main Background
  static const Color backgroundStart = Color(0xFF1F0130);
  static const Color backgroundEnd = Color(0xFF0F0016);

  // Profile Header
  static const Color profileName = Color(0xFFFFFFFF);
  static const Color profileSubtext = Color(0xFFCAA772); // rgba(202, 167, 114, 1)
  static const Color avatarBg = Color(0xFFB1B2B5);
  static const Color avatarBorder = Color(0xFFE1B219); // #e1b219FF gold

  // Green Action Button (Add Cash / Deposit)
  static const Color greenButtonStart = Color(0xFF00B57F); // rgba(0, 181, 127, 1)
  static const Color greenButtonEnd = Color(0xFF009A69);   // rgba(0, 154, 105, 1)

  static const LinearGradient greenButtonGradient = LinearGradient(
    begin: Alignment.topCenter,
    end: Alignment.bottomCenter,
    colors: [greenButtonStart, greenButtonEnd],
  );

  // Ticker Gradient
  static const LinearGradient tickerGradient = LinearGradient(
    begin: Alignment.topCenter,
    end: Alignment.bottomCenter,
    stops: [0.03, 0.33, 0.63, 1.0],
    colors: [
      Color(0xFF1F0130), // rgba(31, 1, 48, 1)
      Color(0xFF3F0A44), // rgba(63, 10, 68, 1)
      Color(0xFF380B3F), // rgba(56, 11, 63, 1)
      Color(0xFF1F0130), // rgba(31, 1, 48, 1)
    ],
  );

  // Card Border & Accent
  static const Color cardBorder = Color(0xFF4F106D);
  static const Color liveIndicator = Color(0xFF00FF87);

  // Bottom Navigation Bar Gradient
  static const LinearGradient bottomNavGradient = LinearGradient(
    begin: Alignment.topCenter,
    end: Alignment.bottomCenter,
    colors: [
      Color(0xFF531171), // rgba(83, 17, 113, 1)
      Color(0xFF320346), // rgba(50, 3, 70, 1)
    ],
  );
}
