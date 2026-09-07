import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../theme/app_colors.dart';

class HelpCentreScreen extends StatefulWidget {
  final VoidCallback onBackPressed;

  const HelpCentreScreen({
    super.key,
    required this.onBackPressed,
  });

  @override
  State<HelpCentreScreen> createState() => _HelpCentreScreenState();
}

class _HelpCentreScreenState extends State<HelpCentreScreen> {
  final TextEditingController _searchController = TextEditingController();
  int? _expandedFaqIndex;

  final List<Map<String, String>> _faqs = const [
    {
      'question': 'How long does a cash withdrawal take?',
      'answer': 'Withdrawals via UPI or Bank Transfer are processed instantly. In rare cases of bank server delays, it can take up to 24 hours.'
    },
    {
      'question': 'What to do if money was deducted but not added to wallet?',
      'answer': 'Do not worry! Bank payment gateways automatically refund failed transactions within 24-48 hours. If it takes longer, raise a ticket under "My reported issues".'
    },
    {
      'question': 'Is InGames safe and legal in India?',
      'answer': 'Yes, InGames offers skill-based games that are 100% legal under Indian gaming laws and protected by high-grade encryption.'
    },
    {
      'question': 'How do I complete my KYC verification?',
      'answer': 'Go to Profile > KYC Verification, upload a valid Aadhaar or PAN card image, and your account will be verified within a few minutes.'
    },
    {
      'question': 'How do bonus rewards work?',
      'answer': 'Bonus rewards can be used to join select tournaments and contests. A percentage of the bonus is used automatically during match entry.'
    },
  ];

  @override
  Widget build(BuildContext context) {
    return Container(
      color: AppColors.backgroundStart,
      child: SafeArea(
        child: Column(
          children: [
            // Top Bar
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 14.0, vertical: 12.0),
              child: Row(
                children: [
                  IconButton(
                    icon: const Icon(Icons.arrow_back, color: Colors.white, size: 24),
                    onPressed: widget.onBackPressed,
                  ),
                  const SizedBox(width: 8),
                  Text(
                    'Help Centre',
                    style: GoogleFonts.poppins(
                      color: Colors.white,
                      fontSize: 20,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              ),
            ),

            Expanded(
              child: ListView(
                physics: const BouncingScrollPhysics(),
                padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 8.0),
                children: [
                  // Search Bar
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
                    decoration: BoxDecoration(
                      color: const Color(0xFF2B073D),
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(color: AppColors.cardBorder),
                    ),
                    child: Row(
                      children: [
                        const Icon(Icons.search_rounded, color: Colors.white54, size: 22),
                        const SizedBox(width: 10),
                        Expanded(
                          child: TextField(
                            controller: _searchController,
                            style: GoogleFonts.poppins(color: Colors.white, fontSize: 14),
                            decoration: InputDecoration(
                              hintText: 'Search for issues, FAQs...',
                              hintStyle: GoogleFonts.poppins(color: Colors.white38, fontSize: 14),
                              border: InputBorder.none,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),

                  const SizedBox(height: 20),

                  // Quick Categories Grid
                  Text(
                    'Browse Topics',
                    style: GoogleFonts.poppins(
                      color: Colors.white,
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 12),

                  GridView.count(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    crossAxisCount: 2,
                    crossAxisSpacing: 12,
                    mainAxisSpacing: 12,
                    childAspectRatio: 1.5,
                    children: [
                      _buildTopicCard(Icons.account_balance_wallet_rounded, 'Deposits & Withdrawals', Colors.amber),
                      _buildTopicCard(Icons.sports_esports_rounded, 'Gameplay & Rules', Colors.purpleAccent),
                      _buildTopicCard(Icons.verified_user_rounded, 'KYC & Account', Colors.cyanAccent),
                      _buildTopicCard(Icons.card_giftcard_rounded, 'Offers & Rewards', Colors.pinkAccent),
                    ],
                  ),

                  const SizedBox(height: 24),

                  // Frequently Asked Questions
                  Text(
                    'Frequently Asked Questions',
                    style: GoogleFonts.poppins(
                      color: Colors.white,
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 12),

                  ...List.generate(_faqs.length, (index) {
                    final isExpanded = _expandedFaqIndex == index;
                    return Container(
                      margin: const EdgeInsets.only(bottom: 10),
                      decoration: BoxDecoration(
                        color: const Color(0xFF260537),
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
                      ),
                      child: InkWell(
                        onTap: () {
                          setState(() {
                            _expandedFaqIndex = isExpanded ? null : index;
                          });
                        },
                        borderRadius: BorderRadius.circular(14),
                        child: Padding(
                          padding: const EdgeInsets.all(14.0),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                children: [
                                  Expanded(
                                    child: Text(
                                      _faqs[index]['question']!,
                                      style: GoogleFonts.poppins(
                                        color: Colors.white,
                                        fontSize: 14,
                                        fontWeight: FontWeight.w600,
                                      ),
                                    ),
                                  ),
                                  Icon(
                                    isExpanded
                                        ? Icons.keyboard_arrow_up_rounded
                                        : Icons.keyboard_arrow_down_rounded,
                                    color: Colors.white70,
                                  ),
                                ],
                              ),
                              if (isExpanded) ...[
                                const SizedBox(height: 10),
                                const Divider(color: Colors.white12, height: 1),
                                const SizedBox(height: 10),
                                Text(
                                  _faqs[index]['answer']!,
                                  style: GoogleFonts.poppins(
                                    color: Colors.white70,
                                    fontSize: 13,
                                    height: 1.4,
                                  ),
                                ),
                              ],
                            ],
                          ),
                        ),
                      ),
                    );
                  }),

                  const SizedBox(height: 20),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildTopicCard(IconData icon, String title, Color accentColor) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFF2A063C),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: accentColor.withValues(alpha: 0.3)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: accentColor.withValues(alpha: 0.15),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(icon, color: accentColor, size: 20),
          ),
          const SizedBox(height: 10),
          Text(
            title,
            style: GoogleFonts.poppins(
              color: Colors.white,
              fontSize: 13,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}
