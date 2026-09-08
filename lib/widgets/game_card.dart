import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../services/api_service.dart';
import 'shimmer_loading.dart';

class GameCardData {
  final String id;
  final String title;
  final String imagePath;
  final Color accentColor;
  final String gameUrl;

  const GameCardData({
    this.id = '',
    required this.title,
    required this.imagePath,
    this.accentColor = Colors.amber,
    this.gameUrl = '/games/seven_up_down/index.html',
  });
}

class GameCard extends StatelessWidget {
  final GameCardData data;
  final VoidCallback onTap;
  final bool isLoading;

  const GameCard({
    super.key,
    required this.data,
    required this.onTap,
    this.isLoading = false,
  });

  @override
  Widget build(BuildContext context) {
    if (isLoading) {
      return const Padding(
        padding: EdgeInsets.only(right: 16.0),
        child: ShimmerBox(
          width: 260,
          height: 260,
          borderRadius: 18.0,
        ),
      );
    }

    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 260,
        height: 260,
        margin: const EdgeInsets.only(right: 16.0),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(18.0),
          boxShadow: [
            BoxShadow(
              color: Colors.purple.shade900.withValues(alpha: 0.4),
              blurRadius: 14,
              offset: const Offset(0, 6),
            ),
          ],
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(18.0),
          child: Stack(
            fit: StackFit.expand,
            children: [
              // Main Game Poster Image with Multi-Path Resolution
              _buildImageWithFallbacks(data.imagePath),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildImageWithFallbacks(String primaryPath) {
    if (primaryPath.startsWith('http://') || primaryPath.startsWith('https://') || primaryPath.startsWith('/')) {
      final fullUrl = primaryPath.startsWith('/') ? '${ApiService.serverDomain}$primaryPath' : primaryPath;
      return Image.network(
        fullUrl,
        fit: BoxFit.cover,
        frameBuilder: (context, child, frame, wasSynchronouslyLoaded) {
          if (wasSynchronouslyLoaded || frame != null) return child;
          return const ShimmerBox(
            width: double.infinity,
            height: double.infinity,
            borderRadius: 18.0,
          );
        },
        errorBuilder: (context, error, stackTrace) => _buildFallbackCardGraphic(),
      );
    }

    String fileName = primaryPath.split('/').last;
    if (fileName == 'seven_up_down.png' || fileName == '7updown') {
      fileName = '7updown.png';
    } else if (fileName == 'dragon_tiger.png' || fileName == 'dtgame') {
      fileName = 'dtgame.png';
    } else if (fileName == 'crush.png' || fileName == 'classic_dice') {
      fileName = 'classic_dice.png';
    }

    return Image.asset(
      'Assets/images/$fileName',
      fit: BoxFit.cover,
      errorBuilder: (context, error, stackTrace) => _buildFallbackCardGraphic(),
    );
  }

  Widget _buildFallbackCardGraphic() {
    return Container(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            const Color(0xFF4A1068),
            data.accentColor.withValues(alpha: 0.35),
            const Color(0xFF1F0430),
          ],
        ),
      ),
      child: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: Colors.white.withValues(alpha: 0.1),
                border: Border.all(color: data.accentColor, width: 2),
              ),
              child: Icon(
                Icons.sports_esports_rounded,
                size: 52,
                color: data.accentColor,
              ),
            ),
            const SizedBox(height: 12),
            Text(
              data.title,
              style: GoogleFonts.poppins(
                color: Colors.white,
                fontSize: 20,
                fontWeight: FontWeight.w800,
                letterSpacing: 0.3,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
