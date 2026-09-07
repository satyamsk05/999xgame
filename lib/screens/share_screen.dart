import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:flutter_svg/flutter_svg.dart';

class ReferralData {
  final String name;
  final String date;
  final String amount;
  final String avatarPath;

  const ReferralData({
    required this.name,
    required this.date,
    required this.amount,
    required this.avatarPath,
  });
}

class ShareScreen extends StatefulWidget {
  final VoidCallback? onShareTap;
  final VoidCallback? onWhatsAppShareTap;

  const ShareScreen({
    super.key,
    this.onShareTap,
    this.onWhatsAppShareTap,
  });

  @override
  State<ShareScreen> createState() => _ShareScreenState();
}

class _ShareScreenState extends State<ShareScreen> {
  final List<ReferralData> _referrals = const [
    ReferralData(
      name: 'Dh animation',
      date: '09 Dec',
      amount: '₹15',
      avatarPath: 'assets/avatar/avatar_1.png',
    ),
    ReferralData(
      name: 'Harshthakur',
      date: '08 Dec',
      amount: '₹15',
      avatarPath: 'assets/avatar/avatar_2.png',
    ),
    ReferralData(
      name: 'RAHUL',
      date: '07 Dec',
      amount: '₹15',
      avatarPath: 'assets/avatar/avatar_3.png',
    ),
  ];

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        // Main Scrollable Area
        Expanded(
          child: SingleChildScrollView(
            physics: const BouncingScrollPhysics(),
            padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 12.0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Top Header Row: "Refer & Earn" + Language Pill Badge
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  crossAxisAlignment: CrossAxisAlignment.center,
                  children: [
                    Text(
                      'Refer & Earn',
                      style: GoogleFonts.poppins(
                        color: Colors.white,
                        fontSize: 24,
                        fontWeight: FontWeight.w800,
                        letterSpacing: -0.5,
                      ),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                      decoration: BoxDecoration(
                        color: const Color(0xFF5E217C),
                        borderRadius: BorderRadius.circular(20),
                        border: Border.all(color: Colors.white.withValues(alpha: 0.15)),
                      ),
                      child: Row(
                        children: [
                          Text(
                            'अ',
                            style: GoogleFonts.poppins(
                              color: Colors.white,
                              fontSize: 13,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                          const SizedBox(width: 4),
                          const Icon(
                            Icons.chat_bubble_outline_rounded,
                            color: Colors.white,
                            size: 13,
                          ),
                        ],
                      ),
                    ),
                  ],
                ),

                const SizedBox(height: 12),

                // Your Earnings Banner with Green Money Bag Graphic
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  crossAxisAlignment: CrossAxisAlignment.center,
                  children: [
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Your Earnings',
                          style: GoogleFonts.poppins(
                            color: Colors.white54,
                            fontSize: 13,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          '₹30',
                          style: GoogleFonts.inter(
                            color: Colors.white,
                            fontSize: 34,
                            fontWeight: FontWeight.w900,
                            letterSpacing: -0.8,
                          ),
                        ),
                      ],
                    ),
                    // Money Bag + Gold Coins Graphic Illustration
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                      decoration: BoxDecoration(
                        color: const Color(0xFF260435),
                        borderRadius: BorderRadius.circular(16),
                      ),
                      child: Row(
                        children: [
                          const Text('💰', style: TextStyle(fontSize: 26)),
                          const SizedBox(width: 4),
                          Container(
                            padding: const EdgeInsets.all(8),
                            decoration: const BoxDecoration(
                              color: Color(0xFF00E676),
                              shape: BoxShape.circle,
                            ),
                            child: const Text(
                              '₹',
                              style: TextStyle(
                                color: Colors.black,
                                fontSize: 18,
                                fontWeight: FontWeight.w900,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),

                const SizedBox(height: 16),

                // --------------------------------------------------------------
                // TOP CARD: "1 Referral = ₹1,000" Breakdown Card
                // --------------------------------------------------------------
                _buildTopReferralRewardCard(),

                const SizedBox(height: 16),

                // Recent Referrals List Card
                _buildRecentReferralsCard(),

                const SizedBox(height: 20),
              ],
            ),
          ),
        ),

        // --------------------------------------------------------------------
        // FIXED BOTTOM ACTION BAR: Purple Share (Left) & Green WhatsApp (Right)
        // --------------------------------------------------------------------
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          decoration: BoxDecoration(
            color: const Color(0xFF1B0326),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.6),
                blurRadius: 10,
                offset: const Offset(0, -4),
              ),
            ],
          ),
          child: Row(
            children: [
              // Purple Share Button (Left)
              Expanded(
                flex: 2,
                child: InkWell(
                  onTap: () {
                    if (widget.onShareTap != null) {
                      widget.onShareTap!();
                    } else {
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(
                          content: Text(
                            'Referral link copied to clipboard! 🚀',
                            style: GoogleFonts.poppins(),
                          ),
                          backgroundColor: const Color(0xFF7C4DFF),
                          behavior: SnackBarBehavior.floating,
                        ),
                      );
                    }
                  },
                  borderRadius: BorderRadius.circular(12),
                  child: Container(
                    height: 48,
                    padding: const EdgeInsets.symmetric(horizontal: 12),
                    decoration: BoxDecoration(
                      gradient: const LinearGradient(
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                        colors: [
                          Color(0xFF8B4DFF),
                          Color(0xFF5E17D6),
                        ],
                      ),
                      borderRadius: BorderRadius.circular(12),
                      boxShadow: [
                        BoxShadow(
                          color: const Color(0xFF6C20E0).withValues(alpha: 0.4),
                          blurRadius: 6,
                          offset: const Offset(0, 3),
                        ),
                      ],
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        const Icon(
                          Icons.share_rounded,
                          color: Colors.white,
                          size: 18,
                        ),
                        const SizedBox(width: 8),
                        Text(
                          'Share',
                          style: GoogleFonts.poppins(
                            color: Colors.white,
                            fontSize: 15,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),

              const SizedBox(width: 10),

              // Green WhatsApp Share Button (Right)
              Expanded(
                flex: 3,
                child: InkWell(
                  onTap: () {
                    if (widget.onWhatsAppShareTap != null) {
                      widget.onWhatsAppShareTap!();
                    } else {
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(
                          content: Text(
                            'Opening WhatsApp to share invite link...',
                            style: GoogleFonts.poppins(),
                          ),
                          backgroundColor: const Color(0xFF00E676),
                          behavior: SnackBarBehavior.floating,
                        ),
                      );
                    }
                  },
                  borderRadius: BorderRadius.circular(12),
                  child: Container(
                    height: 48,
                    padding: const EdgeInsets.symmetric(horizontal: 12),
                    decoration: BoxDecoration(
                      gradient: const LinearGradient(
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                        colors: [
                          Color(0xFF00D656),
                          Color(0xFF009638),
                        ],
                      ),
                      borderRadius: BorderRadius.circular(12),
                      boxShadow: [
                        BoxShadow(
                          color: const Color(0xFF00B042).withValues(alpha: 0.4),
                          blurRadius: 6,
                          offset: const Offset(0, 3),
                        ),
                      ],
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        SvgPicture.asset(
                          'Assets/whatsapp-svgrepo-com.svg',
                          width: 24,
                          height: 24,
                        ),
                        const SizedBox(width: 8),
                        Flexible(
                          child: Text(
                            'Share on Whatsapp',
                            style: GoogleFonts.poppins(
                              color: Colors.white,
                              fontSize: 14,
                              fontWeight: FontWeight.w700,
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  // --------------------------------------------------------------------------
  // Widget: Top "1 Referral = ₹1,000" Reward Breakdown Card
  // --------------------------------------------------------------------------
  Widget _buildTopReferralRewardCard() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 18),
      decoration: BoxDecoration(
        color: const Color(0xFF260435),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
          color: Colors.purple.shade900.withValues(alpha: 0.5),
          width: 1.2,
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.35),
            blurRadius: 10,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        children: [
          // Main Title Header: "1 Referral = ₹1,000"
          RichText(
            text: TextSpan(
              children: [
                TextSpan(
                  text: '1 Referral = ',
                  style: GoogleFonts.poppins(
                    color: const Color(0xFFFFD700), // Golden Yellow
                    fontSize: 20,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                TextSpan(
                  text: '₹1,000',
                  style: GoogleFonts.inter(
                    color: const Color(0xFF00E676), // Vibrant Green
                    fontSize: 22,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ],
            ),
          ),

          const SizedBox(height: 20),

          // 3-Step Breakdown Row: ₹15 + ₹55 + ₹930
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Step 1: ₹15 signs up
              Expanded(
                child: _buildReferralStepItem(
                  amount: '₹15',
                  label: 'signs up',
                  showInfo: false,
                  iconWidget: _buildPhoneHandIcon(),
                ),
              ),

              // Plus Sign
              Padding(
                padding: const EdgeInsets.only(top: 8.0),
                child: Text(
                  '+',
                  style: GoogleFonts.inter(
                    color: Colors.white60,
                    fontSize: 22,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),

              // Step 2: ₹55 adds cash
              Expanded(
                child: _buildReferralStepItem(
                  amount: '₹55',
                  label: 'adds cash',
                  showInfo: true,
                  iconWidget: _buildCashHandIcon(),
                ),
              ),

              // Plus Sign
              Padding(
                padding: const EdgeInsets.only(top: 8.0),
                child: Text(
                  '+',
                  style: GoogleFonts.inter(
                    color: Colors.white60,
                    fontSize: 22,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),

              // Step 3: ₹930 play games
              Expanded(
                child: _buildReferralStepItem(
                  amount: '₹930',
                  label: 'play games',
                  showInfo: true,
                  iconWidget: _buildGamepadHandIcon(),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildReferralStepItem({
    required String amount,
    required String label,
    required bool showInfo,
    required Widget iconWidget,
  }) {
    return Column(
      children: [
        Text(
          amount,
          style: GoogleFonts.inter(
            color: Colors.white,
            fontSize: 18,
            fontWeight: FontWeight.w800,
          ),
        ),
        const SizedBox(height: 2),
        Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              label,
              style: GoogleFonts.poppins(
                color: Colors.white54,
                fontSize: 11,
                fontWeight: FontWeight.w500,
              ),
            ),
            if (showInfo) ...[
              const SizedBox(width: 3),
              const Icon(
                Icons.info_outline_rounded,
                color: Colors.white38,
                size: 11,
              ),
            ],
          ],
        ),
        const SizedBox(height: 12),
        iconWidget,
      ],
    );
  }

  Widget _buildPhoneHandIcon() {
    return Image.asset(
      'Assets/IMG_20260904_223443.png',
      width: 50,
      height: 50,
      fit: BoxFit.contain,
    );
  }

  Widget _buildCashHandIcon() {
    return Image.asset(
      'Assets/refercoin.png',
      width: 50,
      height: 50,
      fit: BoxFit.contain,
    );
  }

  Widget _buildGamepadHandIcon() {
    return Image.asset(
      'Assets/IMG_20260904_223402.png',
      width: 50,
      height: 50,
      fit: BoxFit.contain,
    );
  }



  // --------------------------------------------------------------------------
  // Widget: Recent Referrals Card
  // --------------------------------------------------------------------------
  Widget _buildRecentReferralsCard() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      decoration: BoxDecoration(
        color: const Color(0xFF260435),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
          color: Colors.purple.shade900.withValues(alpha: 0.5),
          width: 1.2,
        ),
      ),
      child: Column(
        children: [
          ListView.separated(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: _referrals.length,
            separatorBuilder: (context, index) => const Padding(
              padding: EdgeInsets.symmetric(vertical: 8),
              child: Divider(color: Colors.white12, height: 1),
            ),
            itemBuilder: (context, index) {
              final item = _referrals[index];
              return Row(
                children: [
                  Container(
                    width: 42,
                    height: 42,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      border: Border.all(color: const Color(0xFFAB47BC), width: 1.5),
                    ),
                    child: ClipOval(
                      child: Image.asset(
                        item.avatarPath,
                        width: 42,
                        height: 42,
                        fit: BoxFit.cover,
                        errorBuilder: (context, error, stackTrace) => Container(
                          color: Colors.purple.shade800,
                          child: const Icon(Icons.person, color: Colors.white, size: 22),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          item.name,
                          style: GoogleFonts.poppins(
                            color: Colors.white,
                            fontSize: 14,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        Text(
                          item.date,
                          style: GoogleFonts.poppins(
                            color: Colors.white54,
                            fontSize: 11,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                      ],
                    ),
                  ),
                  Text(
                    item.amount,
                    style: GoogleFonts.inter(
                      color: Colors.white,
                      fontSize: 16,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ],
              );
            },
          ),
          const Padding(
            padding: EdgeInsets.only(top: 12, bottom: 8),
            child: Divider(color: Colors.white12, height: 1),
          ),
          InkWell(
            onTap: () {},
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(
                  'View all referrals',
                  style: GoogleFonts.poppins(
                    color: Colors.white,
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(width: 4),
                const Icon(
                  Icons.chevron_right_rounded,
                  color: Colors.white,
                  size: 18,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
