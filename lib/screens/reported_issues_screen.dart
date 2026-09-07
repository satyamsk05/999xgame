import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../theme/app_colors.dart';

class ReportedIssuesScreen extends StatefulWidget {
  final VoidCallback onBackPressed;

  const ReportedIssuesScreen({
    super.key,
    required this.onBackPressed,
  });

  @override
  State<ReportedIssuesScreen> createState() => _ReportedIssuesScreenState();
}

class _ReportedIssuesScreenState extends State<ReportedIssuesScreen> {
  String _selectedFilter = 'All';

  final List<Map<String, dynamic>> _tickets = const [
    {
      'id': 'TNK-98241',
      'title': 'Deposit delay via UPI',
      'category': 'Payment',
      'date': '04 Sep 2026, 09:42 PM',
      'status': 'In Progress',
      'statusColor': Colors.amber,
      'description': 'Payment of ₹500 deducted from bank account but not credited to gaming wallet.',
    },
    {
      'id': 'TNK-87120',
      'title': 'Withdrawal verification inquiry',
      'category': 'Withdrawal',
      'date': '28 Aug 2026, 02:15 PM',
      'status': 'Resolved',
      'statusColor': Color(0xFF00E676),
      'description': 'KYC documents verified and instant withdrawal processed to Bank Account ending in 8912.',
    },
    {
      'id': 'TNK-74109',
      'title': 'Ludo Match disconnection issue',
      'category': 'Gameplay',
      'date': '15 Aug 2026, 11:30 AM',
      'status': 'Resolved',
      'statusColor': Color(0xFF00E676),
      'description': 'Refund of entry fee ₹50 issued due to server sync issue during match.',
    },
  ];

  @override
  Widget build(BuildContext context) {
    final filteredTickets = _tickets.where((ticket) {
      if (_selectedFilter == 'All') return true;
      if (_selectedFilter == 'Pending') return ticket['status'] == 'In Progress';
      if (_selectedFilter == 'Resolved') return ticket['status'] == 'Resolved';
      return true;
    }).toList();

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
                    'My Reported Issues',
                    style: GoogleFonts.poppins(
                      color: Colors.white,
                      fontSize: 20,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              ),
            ),

            // Filter Tabs
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 6.0),
              child: Row(
                children: ['All', 'Pending', 'Resolved'].map((filter) {
                  final isSelected = _selectedFilter == filter;
                  return Padding(
                    padding: const EdgeInsets.only(right: 8.0),
                    child: ChoiceChip(
                      label: Text(
                        filter,
                        style: GoogleFonts.poppins(
                          color: isSelected ? Colors.white : Colors.white70,
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      selected: isSelected,
                      selectedColor: const Color(0xFF6B1884),
                      backgroundColor: const Color(0xFF260537),
                      side: BorderSide(
                        color: isSelected ? Colors.purpleAccent : Colors.transparent,
                      ),
                      onSelected: (selected) {
                        if (selected) {
                          setState(() {
                            _selectedFilter = filter;
                          });
                        }
                      },
                    ),
                  );
                }).toList(),
              ),
            ),

            const SizedBox(height: 10),

            // Tickets List
            Expanded(
              child: filteredTickets.isEmpty
                  ? Center(
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(Icons.assignment_outlined, color: Colors.white38, size: 54),
                          const SizedBox(height: 12),
                          Text(
                            'No reported issues found',
                            style: GoogleFonts.poppins(color: Colors.white60, fontSize: 14),
                          ),
                        ],
                      ),
                    )
                  : ListView.builder(
                      physics: const BouncingScrollPhysics(),
                      padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 8.0),
                      itemCount: filteredTickets.length,
                      itemBuilder: (context, index) {
                        final ticket = filteredTickets[index];
                        return Container(
                          margin: const EdgeInsets.only(bottom: 12),
                          padding: const EdgeInsets.all(16),
                          decoration: BoxDecoration(
                            color: const Color(0xFF260537),
                            borderRadius: BorderRadius.circular(16),
                            border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                children: [
                                  Text(
                                    ticket['id'],
                                    style: GoogleFonts.inter(
                                      color: Colors.white54,
                                      fontSize: 12,
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                  Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                                    decoration: BoxDecoration(
                                      color: (ticket['statusColor'] as Color).withValues(alpha: 0.15),
                                      borderRadius: BorderRadius.circular(20),
                                      border: Border.all(color: ticket['statusColor']),
                                    ),
                                    child: Text(
                                      ticket['status'],
                                      style: GoogleFonts.poppins(
                                        color: ticket['statusColor'],
                                        fontSize: 11,
                                        fontWeight: FontWeight.w700,
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 8),
                              Text(
                                ticket['title'],
                                style: GoogleFonts.poppins(
                                  color: Colors.white,
                                  fontSize: 15,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                              const SizedBox(height: 6),
                              Text(
                                ticket['description'],
                                style: GoogleFonts.poppins(
                                  color: Colors.white70,
                                  fontSize: 13,
                                  height: 1.4,
                                ),
                              ),
                              const SizedBox(height: 12),
                              const Divider(color: Colors.white12, height: 1),
                              const SizedBox(height: 10),
                              Row(
                                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                children: [
                                  Text(
                                    ticket['date'],
                                    style: GoogleFonts.poppins(
                                      color: Colors.white38,
                                      fontSize: 11,
                                    ),
                                  ),
                                  Row(
                                    children: [
                                      Text(
                                        'View Details',
                                        style: GoogleFonts.poppins(
                                          color: Colors.purpleAccent,
                                          fontSize: 12,
                                          fontWeight: FontWeight.w600,
                                        ),
                                      ),
                                      const SizedBox(width: 4),
                                      const Icon(Icons.arrow_forward_ios_rounded, color: Colors.purpleAccent, size: 12),
                                    ],
                                  ),
                                ],
                              ),
                            ],
                          ),
                        );
                      },
                    ),
            ),

            // Raise New Ticket Button
            Padding(
              padding: const EdgeInsets.all(16.0),
              child: SizedBox(
                width: double.infinity,
                height: 50,
                child: ElevatedButton.icon(
                  onPressed: () {
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(
                        content: Text('Raise New Ticket feature opened', style: GoogleFonts.poppins()),
                        backgroundColor: const Color(0xFF6B1884),
                        behavior: SnackBarBehavior.floating,
                      ),
                    );
                  },
                  icon: const Icon(Icons.add_circle_outline_rounded, color: Colors.white),
                  label: Text(
                    'Raise New Support Ticket',
                    style: GoogleFonts.poppins(
                      color: Colors.white,
                      fontSize: 15,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF6B1884),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
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
