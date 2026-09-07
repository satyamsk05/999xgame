import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../widgets/update_dialog.dart';

class SettingsScreen extends StatelessWidget {
  final VoidCallback onBackPressed;
  final VoidCallback onAddCashTap;
  final VoidCallback onTransactionHistoryTap;
  final VoidCallback onWithdrawalsTap;
  final VoidCallback? onHelpCentreTap;
  final VoidCallback? onReportedIssuesTap;
  final VoidCallback? onAboutUsTap;
  final VoidCallback? onContactUsTap;
  final VoidCallback? onFairPlayTap;

  const SettingsScreen({
    super.key,
    required this.onBackPressed,
    required this.onAddCashTap,
    required this.onTransactionHistoryTap,
    required this.onWithdrawalsTap,
    this.onHelpCentreTap,
    this.onReportedIssuesTap,
    this.onAboutUsTap,
    this.onContactUsTap,
    this.onFairPlayTap,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      color: const Color(0xFF1B0326),
      child: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Top Bar
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 14.0, vertical: 12.0),
              child: Row(
                children: [
                  IconButton(
                    icon: const Icon(Icons.arrow_back, color: Colors.white, size: 24),
                    onPressed: onBackPressed,
                  ),
                  const SizedBox(width: 8),
                  Text(
                    'Settings',
                    style: GoogleFonts.poppins(
                      color: Colors.white,
                      fontSize: 22,
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
                  // SECTION 1: Money
                  _buildSectionHeader('Money'),
                  const SizedBox(height: 8),
                  _buildSettingsItem(
                    icon: Icons.add_card_rounded,
                    title: 'Add cash',
                    onTap: onAddCashTap,
                  ),
                  _buildSettingsItem(
                    icon: Icons.history_rounded,
                    title: 'Transaction history',
                    onTap: onTransactionHistoryTap,
                  ),
                  _buildSettingsItem(
                    icon: Icons.currency_rupee_rounded,
                    title: 'Withdrawals',
                    onTap: onWithdrawalsTap,
                    isLastInSection: true,
                  ),

                  const SizedBox(height: 24),

                  // SECTION 2: Help
                  _buildSectionHeader('Help & Updates'),
                  const SizedBox(height: 8),
                  _buildSettingsItem(
                    icon: Icons.system_update_rounded,
                    title: 'Check for updates',
                    onTap: () => InAppUpdateDialog.show(context),
                  ),
                  _buildSettingsItem(
                    icon: Icons.help_outline_rounded,
                    title: 'Help Centre',
                    onTap: onHelpCentreTap ?? () => _showHelpMessage(context, 'Help Centre'),
                  ),
                  _buildSettingsItem(
                    icon: Icons.receipt_long_outlined,
                    title: 'My reported issues',
                    onTap: onReportedIssuesTap ?? () => _showHelpMessage(context, 'My reported issues'),
                  ),
                  _buildSettingsItem(
                    icon: Icons.info_outline_rounded,
                    title: 'About us',
                    onTap: onAboutUsTap ?? () => _showHelpMessage(context, 'About us'),
                  ),
                  _buildSettingsItem(
                    icon: Icons.mail_outline_rounded,
                    title: 'Contact us',
                    onTap: onContactUsTap ?? () => _showHelpMessage(context, 'Contact us'),
                  ),
                  _buildSettingsItem(
                    icon: Icons.shield_outlined,
                    title: 'InGames Fair Play',
                    onTap: onFairPlayTap ?? () => _showHelpMessage(context, 'Fair Play Policy'),
                    isLastInSection: true,
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSectionHeader(String title) {
    return Text(
      title,
      style: GoogleFonts.poppins(
        color: Colors.white54,
        fontSize: 14,
        fontWeight: FontWeight.w600,
        letterSpacing: 0.5,
      ),
    );
  }

  Widget _buildSettingsItem({
    required IconData icon,
    required String title,
    required VoidCallback onTap,
    bool isLastInSection = false,
  }) {
    return InkWell(
      onTap: onTap,
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 16.0),
            child: Row(
              children: [
                Icon(
                  icon,
                  color: Colors.white70,
                  size: 22,
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Text(
                    title,
                    style: GoogleFonts.poppins(
                      color: Colors.white,
                      fontSize: 16,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ),
                const Icon(
                  Icons.chevron_right_rounded,
                  color: Colors.white38,
                  size: 24,
                ),
              ],
            ),
          ),
          if (!isLastInSection)
            const Divider(
              color: Colors.white12,
              height: 1,
              indent: 38,
            ),
        ],
      ),
    );
  }

  void _showHelpMessage(BuildContext context, String featureName) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          '$featureName opened',
          style: GoogleFonts.poppins(),
        ),
        backgroundColor: const Color(0xFF6B1884),
        behavior: SnackBarBehavior.floating,
      ),
    );
  }
}
