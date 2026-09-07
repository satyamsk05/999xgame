import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:google_fonts/google_fonts.dart';
import '../theme/app_colors.dart';

class CustomBottomNavBar extends StatelessWidget {
  final int selectedIndex;
  final ValueChanged<int> onItemSelected;

  const CustomBottomNavBar({
    super.key,
    required this.selectedIndex,
    required this.onItemSelected,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        gradient: AppColors.bottomNavGradient,
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.5),
            blurRadius: 10,
            offset: const Offset(0, -3),
          ),
        ],
      ),
      child: SafeArea(
        top: false,
        child: SizedBox(
          height: 64,
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: [
              _NavBarItem(
                index: 0,
                isSelected: selectedIndex == 0,
                label: 'Home',
                size: 26,
                onTap: () => onItemSelected(0),
              ),
              _NavBarItem(
                index: 1,
                isSelected: selectedIndex == 1,
                label: 'Share',
                size: 26,
                onTap: () => onItemSelected(1),
              ),
              _NavBarItem(
                index: 2,
                isSelected: selectedIndex == 2,
                label: 'Add Cash',
                size: 26,
                onTap: () => onItemSelected(2),
              ),
              _NavBarItem(
                index: 3,
                isSelected: selectedIndex == 3,
                label: 'Profile',
                size: 26,
                onTap: () => onItemSelected(3),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _NavBarItem extends StatefulWidget {
  final int index;
  final bool isSelected;
  final String label;
  final double size;
  final VoidCallback onTap;

  const _NavBarItem({
    required this.index,
    required this.isSelected,
    required this.label,
    required this.size,
    required this.onTap,
  });

  @override
  State<_NavBarItem> createState() => _NavBarItemState();
}

class _NavBarItemState extends State<_NavBarItem> with SingleTickerProviderStateMixin {
  late AnimationController _animController;
  late Animation<double> _partAnimation;

  @override
  void initState() {
    super.initState();
    _animController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 400),
    );

    _partAnimation = TweenSequence<double>([
      TweenSequenceItem(tween: Tween(begin: 0.0, end: 1.0).chain(CurveTween(curve: Curves.easeOutCubic)), weight: 50),
      TweenSequenceItem(tween: Tween(begin: 1.0, end: 0.0).chain(CurveTween(curve: Curves.easeInOutCubic)), weight: 50),
    ]).animate(_animController);
  }

  @override
  void didUpdateWidget(covariant _NavBarItem oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.isSelected && !oldWidget.isSelected) {
      _animController.forward(from: 0.0);
    }
  }

  @override
  void dispose() {
    _animController.dispose();
    super.dispose();
  }

  void _handleTap() {
    _animController.forward(from: 0.0);
    widget.onTap();
  }

  // --- SVG PART STRINGS ---
  // 1. HOME
  static const String _homeBody = '''
<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<path opacity="0.5" d="M2 12.2039C2 9.91549 2 8.77128 2.5192 7.82274C3.0384 6.87421 3.98695 6.28551 5.88403 5.10813L7.88403 3.86687C9.88939 2.62229 10.8921 2 12 2C13.1079 2 14.1106 2.62229 16.116 3.86687L18.116 5.10812C20.0131 6.28551 20.9616 6.87421 21.4808 7.82274C22 8.77128 22 9.91549 22 12.2039V13.725C22 17.6258 22 19.5763 20.8284 20.7881C19.6569 22 17.7712 22 14 22H10C6.22876 22 4.34315 22 3.17157 20.7881C2 19.5763 2 17.6258 2 13.725V12.2039Z" fill="HEXCOLOR"/>
</svg>''';

  static const String _homeLine = '''
<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M9 17.25C8.58579 17.25 8.25 17.5858 8.25 18C8.25 18.4142 8.58579 18.75 9 18.75H15C15.4142 18.75 15.75 18.4142 15.75 18C15.75 17.5858 15.4142 17.25 15 17.25H9Z" fill="HEXCOLOR"/>
</svg>''';

  // 2. SHARE
  static const String _shareBox = '''
<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<path opacity="0.5" d="M1 13.5289C1 8.862 1 6.52855 2.44982 5.07873C3.89964 3.62891 6.2331 3.62891 10.9 3.62891C15.5669 3.62891 17.9004 3.62891 19.3502 5.07873C20.8 6.52855 20.8 8.862 20.8 13.5289C20.8 18.1958 20.8 20.5293 19.3502 21.9791C17.9004 23.4289 15.5669 23.4289 10.9 23.4289C6.2331 23.4289 3.89964 23.4289 2.44982 21.9791C1 20.5293 1 18.1958 1 13.5289Z" fill="HEXCOLOR"/>
</svg>''';

  static const String _shareArrow = '''
<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M17.6703 1.90726L20.2633 4.15452C22.0483 5.70149 22.9408 6.47497 22.9408 7.47955C22.9408 8.48414 22.0483 9.25762 20.2633 10.8046L17.6703 13.0519C16.8855 13.7321 16.493 14.0722 16.1715 13.9254C15.8499 13.7786 15.8499 13.2592 15.8499 12.2206V10.5438C13.1999 10.5438 10.3726 11.5318 8.64962 13.2434C8.12486 13.7646 7.86248 14.0252 7.72286 13.9591C7.58324 13.8929 7.61571 13.5563 7.68065 12.883C8.32892 6.1615 12.7424 4.41527 15.8499 4.41527V2.73851C15.8499 1.69987 15.8499 1.18055 16.1715 1.03373C16.493 0.886898 16.8855 1.22702 17.6703 1.90726Z" fill="HEXCOLOR"/>
</svg>''';

  // 3. ADD MONEY / WALLET
  static const String _walletBody = '''
<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<path opacity="0.5" d="M21.1394 10.0015C21.1394 8.82091 21.0965 7.55447 20.3418 6.64658C20.2689 6.55894 20.1914 6.47384 20.1088 6.39124C19.3604 5.64288 18.4114 5.31076 17.239 5.15314C16.0998 4.99997 14.6442 4.99999 12.8064 5H10.6936C8.85583 4.99999 7.40019 4.99997 6.26098 5.15314C5.08856 5.31076 4.13961 5.64288 3.39124 6.39124C2.64288 7.13961 2.31076 8.08856 2.15314 9.26098C1.99997 10.4002 1.99999 11.8558 2 13.6936V13.8064C1.99999 15.6442 1.99997 17.0998 2.15314 18.239C2.31076 19.4114 2.64288 20.3604 3.39124 21.1088C4.13961 21.8571 5.08856 22.1892 6.26098 22.3469C7.40018 22.5 8.8558 22.5 10.6935 22.5H12.8064C14.6442 22.5 16.0998 22.5 17.239 22.3469C18.4114 22.1892 19.3604 21.8571 20.1088 21.1088C20.3133 20.9042 20.487 20.6844 20.6346 20.4486C21.0851 19.7291 21.1394 18.8473 21.1394 17.9985C21.0912 18 21.0404 18 20.9882 18L18.2149 18C15.9435 18 14 16.2639 14 14C14 11.7361 15.9435 10 18.2149 10L20.9881 10C21.0403 9.99999 21.0912 9.99997 21.1394 10.0015Z" fill="HEXCOLOR"/>
<path d="M10.1013 2.57211L7.99988 3.99253L6.2666 5.15237C7.40496 4.99997 8.8588 4.99999 10.6935 5H12.8063C14.6441 4.99998 16.0997 4.99997 17.2389 5.15314C17.4681 5.18394 17.6887 5.22142 17.9009 5.26737L15.9999 4L13.8874 2.57211C12.7588 1.8093 11.2299 1.8093 10.1013 2.57211Z" fill="HEXCOLOR"/>
</svg>''';

  static const String _walletCoin = '''
<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<path fill-rule="evenodd" clip-rule="evenodd" d="M21.1884 10.0038C21.1262 9.99995 21.0584 9.99998 20.9881 10L20.9706 10H18.2149C15.9435 10 14 11.7361 14 14C14 16.2639 15.9435 18 18.2149 18H20.9706L20.9881 18C21.0584 18 21.1262 18 21.1884 17.9962C22.111 17.9397 22.927 17.2386 22.9956 16.2594C23.0001 16.1952 23 16.126 23 16.0619L23 16.0444V11.9556L23 11.9381C23 11.874 23.0001 11.8048 22.9956 11.7406C22.927 10.7614 22.111 10.0603 21.1884 10.0038ZM17.9706 15.0667C18.5554 15.0667 19.0294 14.5891 19.0294 14C19.0294 13.4109 18.5554 12.9333 17.9706 12.9333C17.3858 12.9333 16.9118 13.4109 16.9118 14C16.9118 14.5891 17.3858 15.0667 17.9706 15.0667Z" fill="HEXCOLOR"/>
</svg>''';

  // 4. PROFILE
  static const String _profileBase = '''
<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<path opacity="0.5" d="M22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12Z" fill="HEXCOLOR"/>
<path d="M16.807 19.0112C15.4398 19.9504 13.7841 20.5 12 20.5C10.2159 20.5 8.56023 19.9503 7.193 19.0111C6.58915 18.5963 6.33109 17.8062 6.68219 17.1632C7.41001 15.8302 8.90973 15 12 15C15.0903 15 16.59 15.8303 17.3178 17.1632C17.6689 17.8062 17.4108 18.5964 16.807 19.0112Z" fill="HEXCOLOR"/>
</svg>''';

  static const String _profileHead = '''
<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M12 12C13.6569 12 15 10.6569 15 9C15 7.34315 13.6569 6 12 6C10.3432 6 9.00004 7.34315 9.00004 9C9.00004 10.6569 10.3432 12 12 12Z" fill="HEXCOLOR"/>
</svg>''';

  Widget _buildAnimatedSvgIcon(String hexColor) {
    return AnimatedBuilder(
      animation: _partAnimation,
      builder: (context, child) {
        final val = _partAnimation.value;

        if (widget.index == 0) {
          // Home Icon: Bottom line expands & shrinks horizontally from center
          final lineScaleX = 1.0 + (val * 0.8) - (val > 0.5 ? (val - 0.5) * 1.6 : 0);
          return SizedBox(
            width: widget.size,
            height: widget.size,
            child: Stack(
              children: [
                SvgPicture.string(
                  _homeBody.replaceAll('HEXCOLOR', hexColor),
                  width: widget.size,
                  height: widget.size,
                ),
                Transform.scale(
                  scaleX: lineScaleX,
                  alignment: Alignment.center,
                  child: SvgPicture.string(
                    _homeLine.replaceAll('HEXCOLOR', hexColor),
                    width: widget.size,
                    height: widget.size,
                  ),
                ),
              ],
            ),
          );
        } else if (widget.index == 1) {
          // Share Icon: Arrow (Teer) slides out towards top-right and returns
          final offsetX = val * 5.0;
          final offsetY = -val * 5.0;
          return SizedBox(
            width: widget.size,
            height: widget.size,
            child: Stack(
              clipBehavior: Clip.none,
              children: [
                SvgPicture.string(
                  _shareBox.replaceAll('HEXCOLOR', hexColor),
                  width: widget.size,
                  height: widget.size,
                ),
                Transform.translate(
                  offset: Offset(offsetX, offsetY),
                  child: SvgPicture.string(
                    _shareArrow.replaceAll('HEXCOLOR', hexColor),
                    width: widget.size,
                    height: widget.size,
                  ),
                ),
              ],
            ),
          );
        } else if (widget.index == 2) {
          // Add Cash / Wallet Icon: Coin clasp pops out right and snaps back
          final coinScale = 1.0 + (val * 0.25);
          final coinShiftX = val * 2.5;
          return SizedBox(
            width: widget.size,
            height: widget.size,
            child: Stack(
              children: [
                SvgPicture.string(
                  _walletBody.replaceAll('HEXCOLOR', hexColor),
                  width: widget.size,
                  height: widget.size,
                ),
                Transform.translate(
                  offset: Offset(coinShiftX, 0),
                  child: Transform.scale(
                    scale: coinScale,
                    alignment: Alignment.centerRight,
                    child: SvgPicture.string(
                      _walletCoin.replaceAll('HEXCOLOR', hexColor),
                      width: widget.size,
                      height: widget.size,
                    ),
                  ),
                ),
              ],
            ),
          );
        } else {
          // Profile Icon: Head circle nods / bounces up & down
          final headShiftY = -val * 3.5;
          return SizedBox(
            width: widget.size,
            height: widget.size,
            child: Stack(
              children: [
                SvgPicture.string(
                  _profileBase.replaceAll('HEXCOLOR', hexColor),
                  width: widget.size,
                  height: widget.size,
                ),
                Transform.translate(
                  offset: Offset(0, headShiftY),
                  child: SvgPicture.string(
                    _profileHead.replaceAll('HEXCOLOR', hexColor),
                    width: widget.size,
                    height: widget.size,
                  ),
                ),
              ],
            ),
          );
        }
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    const hexColor = '#FFFFFF';
    final color = widget.isSelected
        ? Colors.white
        : Colors.white.withValues(alpha: 0.5);

    return GestureDetector(
      onTap: _handleTap,
      behavior: HitTestBehavior.opaque,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 250),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
        decoration: widget.isSelected
            ? BoxDecoration(
                color: Colors.white.withValues(alpha: 0.18),
                borderRadius: BorderRadius.circular(12),
                boxShadow: [
                  BoxShadow(
                    color: Colors.white.withValues(alpha: 0.1),
                    blurRadius: 8,
                    spreadRadius: 1,
                  ),
                ],
              )
            : BoxDecoration(
                color: Colors.transparent,
                borderRadius: BorderRadius.circular(12),
              ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Opacity(
              opacity: widget.isSelected ? 1.0 : 0.5,
              child: _buildAnimatedSvgIcon(hexColor),
            ),
            const SizedBox(height: 3),
            AnimatedDefaultTextStyle(
              duration: const Duration(milliseconds: 200),
              style: GoogleFonts.poppins(
                color: color,
                fontSize: 11,
                fontWeight: widget.isSelected ? FontWeight.w700 : FontWeight.w500,
              ),
              child: Text(widget.label),
            ),
          ],
        ),
      ),
    );
  }
}
