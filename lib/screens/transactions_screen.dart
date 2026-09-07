import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

class TransactionItemData {
  final String id;
  final String title;
  final double amount;
  final bool isCredit;
  final DateTime timestamp;
  final String category; // 'Deposit', 'Withdraw', 'Reward', 'Game'

  const TransactionItemData({
    required this.id,
    required this.title,
    required this.amount,
    required this.isCredit,
    required this.timestamp,
    required this.category,
  });
}

class TransactionsScreen extends StatefulWidget {
  final List<TransactionItemData> transactions;
  final VoidCallback onBackPressed;
  final String initialFilter; // 'All', 'Deposit', 'Withdraw'

  const TransactionsScreen({
    super.key,
    required this.transactions,
    required this.onBackPressed,
    this.initialFilter = 'All',
  });

  @override
  State<TransactionsScreen> createState() => _TransactionsScreenState();
}

class _TransactionsScreenState extends State<TransactionsScreen> {
  late String _selectedFilter;

  @override
  void initState() {
    super.initState();
    _selectedFilter = widget.initialFilter;
  }

  List<TransactionItemData> get _filteredTransactions {
    if (_selectedFilter == 'Deposit') {
      return widget.transactions.where((t) => t.category == 'Deposit').toList();
    } else if (_selectedFilter == 'Withdraw') {
      return widget.transactions.where((t) => t.category == 'Withdraw').toList();
    }
    return widget.transactions;
  }

  String _formatTimestamp(DateTime dt) {
    final months = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
    ];
    final month = months[dt.month - 1];
    final day = dt.day;
    final hour = dt.hour > 12 ? dt.hour - 12 : (dt.hour == 0 ? 12 : dt.hour);
    final minute = dt.minute.toString().padLeft(2, '0');
    final period = dt.hour >= 12 ? 'PM' : 'AM';

    return '$day $month, $hour:$minute $period';
  }

  @override
  Widget build(BuildContext context) {
    final items = _filteredTransactions;

    return Container(
      color: const Color(0xFF1B0326),
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
                  const SizedBox(width: 12),
                  Text(
                    'All Transactions',
                    style: GoogleFonts.poppins(
                      color: Colors.white,
                      fontSize: 22,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              ),
            ),

            const SizedBox(height: 8),

            // Filter Tabs Row (All, Deposit, Withdraw)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16.0),
              child: Row(
                children: [
                  _buildFilterTab('All'),
                  const SizedBox(width: 12),
                  _buildFilterTab('Deposit'),
                  const SizedBox(width: 12),
                  _buildFilterTab('Withdraw'),
                ],
              ),
            ),

            const SizedBox(height: 16),

            // Month Header & Transactions List
            Expanded(
              child: items.isEmpty
                  ? Center(
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(
                            Icons.receipt_long_outlined,
                            size: 56,
                            color: Colors.white.withValues(alpha: 0.3),
                          ),
                          const SizedBox(height: 12),
                          Text(
                            'No transactions found for $_selectedFilter',
                            style: GoogleFonts.poppins(
                              color: Colors.white54,
                              fontSize: 14,
                            ),
                          ),
                        ],
                      ),
                    )
                  : ListView(
                      padding: const EdgeInsets.symmetric(horizontal: 16.0),
                      children: [
                        // Section Header: Month
                        Text(
                          'SEPTEMBER 2026',
                          style: GoogleFonts.poppins(
                            color: Colors.white54,
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                            letterSpacing: 1.0,
                          ),
                        ),
                        const SizedBox(height: 12),

                        ...items.map((item) => _buildTransactionCard(item)),
                      ],
                    ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildFilterTab(String label) {
    final isSelected = _selectedFilter == label;

    return GestureDetector(
      onTap: () {
        setState(() {
          _selectedFilter = label;
        });
      },
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 10),
        decoration: BoxDecoration(
          color: isSelected ? const Color(0xFF6B1884) : Colors.transparent,
          borderRadius: BorderRadius.circular(24),
          border: Border.all(
            color: isSelected ? const Color(0xFF6B1884) : Colors.white38,
            width: 1.2,
          ),
        ),
        child: Text(
          label,
          style: GoogleFonts.poppins(
            color: Colors.white,
            fontSize: 14,
            fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
          ),
        ),
      ),
    );
  }

  Widget _buildTransactionCard(TransactionItemData item) {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 14.0),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: [
                  if (item.category == 'Game') ...[
                    Container(
                      padding: const EdgeInsets.all(6),
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.08),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: const Icon(
                        Icons.confirmation_number_outlined,
                        color: Colors.white70,
                        size: 18,
                      ),
                    ),
                    const SizedBox(width: 12),
                  ],
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        item.title,
                        style: GoogleFonts.poppins(
                          color: Colors.white,
                          fontSize: 16,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        _formatTimestamp(item.timestamp),
                        style: GoogleFonts.poppins(
                          color: Colors.white54,
                          fontSize: 12,
                        ),
                      ),
                    ],
                  ),
                ],
              ),

              Row(
                children: [
                  Text(
                    item.isCredit
                        ? '+ ₹${item.amount.toStringAsFixed(item.amount % 1 == 0 ? 0 : 2)}'
                        : '- ₹${item.amount.toStringAsFixed(item.amount % 1 == 0 ? 0 : 2)}',
                    style: GoogleFonts.inter(
                      color: item.isCredit
                          ? const Color(0xFF00E676)
                          : Colors.white,
                      fontSize: 16,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(width: 4),
                  const Icon(
                    Icons.keyboard_arrow_down_rounded,
                    color: Colors.white38,
                    size: 18,
                  ),
                ],
              ),
            ],
          ),
        ),
        const Divider(color: Colors.white12, height: 1),
      ],
    );
  }
}
