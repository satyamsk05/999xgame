import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

class TransactionItemData {
  final String id;
  final String title;
  final double amount;
  final bool isCredit;
  final DateTime timestamp;
  final String category;
  final String? status;
  final String? utr;

  const TransactionItemData({required this.id, required this.title, required this.amount, required this.isCredit, required this.timestamp, required this.category, this.status, this.utr});
}

class TransactionsScreen extends StatefulWidget {
  final List<TransactionItemData> transactions;
  final VoidCallback onBackPressed;
  final String initialFilter;
  const TransactionsScreen({super.key, required this.transactions, required this.onBackPressed, this.initialFilter = 'All'});
  @override State<TransactionsScreen> createState() => _TransactionsScreenState();
}

class _TransactionsScreenState extends State<TransactionsScreen> {
  late String _selectedFilter;
  @override void initState() { super.initState(); _selectedFilter = widget.initialFilter; }

  List<TransactionItemData> get _filteredTransactions {
    if (_selectedFilter == 'Deposit') return widget.transactions.where((t) => t.category == 'Deposit').toList();
    if (_selectedFilter == 'Withdraw') return widget.transactions.where((t) => t.category == 'Withdraw').toList();
    return widget.transactions;
  }

  String _formatTimestamp(DateTime dt) {
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    final hour = dt.hour > 12 ? dt.hour - 12 : (dt.hour == 0 ? 12 : dt.hour);
    return '${dt.day} ${months[dt.month - 1]}, $hour:${dt.minute.toString().padLeft(2, '0')} ${dt.hour >= 12 ? 'PM' : 'AM'}';
  }

  @override
  Widget build(BuildContext context) {
    final items = _filteredTransactions;
    return Container(color: const Color(0xFF1B0326), child: SafeArea(child: Column(children: [
      Padding(padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12), child: Row(children: [
        IconButton(icon: const Icon(Icons.arrow_back, color: Colors.white, size: 24), onPressed: widget.onBackPressed),
        const SizedBox(width: 12),
        Text('Transaction History', style: GoogleFonts.poppins(color: Colors.white, fontSize: 22, fontWeight: FontWeight.w700)),
      ])),
      const SizedBox(height: 8),
      Padding(padding: const EdgeInsets.symmetric(horizontal: 16), child: Row(children: [_buildFilterTab('All'), const SizedBox(width: 12), _buildFilterTab('Deposit'), const SizedBox(width: 12), _buildFilterTab('Withdraw')])),
      const SizedBox(height: 16),
      Expanded(child: items.isEmpty ? Center(child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [Icon(Icons.receipt_long_outlined, size: 56, color: Colors.white.withValues(alpha: .3)), const SizedBox(height: 12), Text('No transactions found for $_selectedFilter', style: GoogleFonts.poppins(color: Colors.white54, fontSize: 14))])) : ListView(padding: const EdgeInsets.symmetric(horizontal: 16), children: [
        Text('RECENT ACTIVITY', style: GoogleFonts.poppins(color: Colors.white54, fontSize: 12, fontWeight: FontWeight.w600, letterSpacing: 1)),
        const SizedBox(height: 12),
        ...items.map(_buildTransactionCard),
      ])),
    ])));
  }

  Widget _buildFilterTab(String label) {
    final selected = _selectedFilter == label;
    return GestureDetector(onTap: () => setState(() => _selectedFilter = label), child: AnimatedContainer(duration: const Duration(milliseconds: 180), padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 10), decoration: BoxDecoration(color: selected ? const Color(0xFF6B1884) : Colors.transparent, borderRadius: BorderRadius.circular(24), border: Border.all(color: selected ? const Color(0xFF6B1884) : Colors.white38, width: 1.2)), child: Text(label, style: GoogleFonts.poppins(color: Colors.white, fontSize: 14, fontWeight: selected ? FontWeight.w700 : FontWeight.w500))));
  }

  Widget _buildTransactionCard(TransactionItemData item) {
    final isDeposit = item.category == 'Deposit';
    return Column(children: [
      Padding(padding: const EdgeInsets.symmetric(vertical: 13), child: Row(children: [
        Container(width: 40, height: 40, decoration: BoxDecoration(color: (item.isCredit ? const Color(0xFF00E676) : Colors.white).withValues(alpha: .12), borderRadius: BorderRadius.circular(12)), child: Icon(isDeposit ? Icons.account_balance_wallet_rounded : (item.category == 'Game' ? Icons.confirmation_number_outlined : Icons.receipt_long_rounded), color: item.isCredit ? const Color(0xFF00E676) : Colors.white70, size: 20)),
        const SizedBox(width: 12),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(item.title, maxLines: 1, overflow: TextOverflow.ellipsis, style: GoogleFonts.poppins(color: Colors.white, fontSize: 15, fontWeight: FontWeight.w600)),
          const SizedBox(height: 2),
          Text(_formatTimestamp(item.timestamp), style: GoogleFonts.poppins(color: Colors.white54, fontSize: 11)),
          if (isDeposit && item.status != null) ...[const SizedBox(height: 5), _statusBadge(item.status!)],
        ])),
        const SizedBox(width: 8),
        Text(item.isCredit ? '+ ₹${item.amount.toStringAsFixed(item.amount % 1 == 0 ? 0 : 2)}' : '- ₹${item.amount.toStringAsFixed(item.amount % 1 == 0 ? 0 : 2)}', style: GoogleFonts.inter(color: item.isCredit ? const Color(0xFF00E676) : Colors.white, fontSize: 15, fontWeight: FontWeight.w800)),
      ]),),
      const Divider(color: Colors.white12, height: 1),
    ]);
  }

  Widget _statusBadge(String status) {
    final normalized = status.toUpperCase();
    final isSuccess = normalized == 'SUCCESS';
    final isRejected = normalized == 'REJECTED';
    final label = isSuccess ? 'SUCCESS' : isRejected ? 'REJECTED' : 'PENDING';
    final icon = isSuccess ? Icons.check_circle_rounded : isRejected ? Icons.cancel_rounded : Icons.hourglass_top_rounded;
    final color = isSuccess ? const Color(0xFF00E676) : isRejected ? Colors.redAccent : Colors.amberAccent;
    return Container(padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3), decoration: BoxDecoration(color: color.withValues(alpha: .12), borderRadius: BorderRadius.circular(20), border: Border.all(color: color.withValues(alpha: .35))), child: Row(mainAxisSize: MainAxisSize.min, children: [Icon(icon, size: 11, color: color), const SizedBox(width: 4), Text(label, style: GoogleFonts.poppins(color: color, fontSize: 9, fontWeight: FontWeight.w800, letterSpacing: .5))]));
  }
}