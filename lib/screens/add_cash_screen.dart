import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:google_fonts/google_fonts.dart';
import '../features/wallet/data/wallet_api.dart';
import '../services/dashboard_sync_manager.dart';

class OfferData {
  final int amount;
  final int cashback;

  const OfferData({required this.amount, required this.cashback});
}

class AddCashScreen extends StatefulWidget {
  final double currentBalance;
  final ValueChanged<double> onAddCashCompleted;

  const AddCashScreen({
    super.key,
    required this.currentBalance,
    required this.onAddCashCompleted,
  });

  @override
  State<AddCashScreen> createState() => _AddCashScreenState();
}

class _AddCashScreenState extends State<AddCashScreen> {
  final TextEditingController _amountController = TextEditingController();
  int? _selectedOfferIndex;
  bool _openingPayment = false;

  List<OfferData> get _offers {
    final data = DashboardSyncManager.dashboardData.value;
    final raw = data['addCashOffers'];
    if (raw is List && raw.isNotEmpty) {
      final parsed = <OfferData>[];
      for (final item in raw) {
        if (item is Map) {
          final amount = (item['amount'] as num?)?.toInt() ?? 0;
          final cashback = (item['cashback'] as num?)?.toInt() ?? 0;
          if (amount > 0) parsed.add(OfferData(amount: amount, cashback: cashback));
        }
      }
      if (parsed.isNotEmpty) return parsed;
    }
    return const [
      OfferData(amount: 200, cashback: 25),
      OfferData(amount: 500, cashback: 75),
      OfferData(amount: 50, cashback: 4),
      OfferData(amount: 100, cashback: 10),
    ];
  }

  @override
  void initState() {
    super.initState();
    DashboardSyncManager.dashboardData.addListener(_refresh);
    _amountController.addListener(_refresh);
  }

  void _refresh() {
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    DashboardSyncManager.dashboardData.removeListener(_refresh);
    _amountController.removeListener(_refresh);
    _amountController.dispose();
    super.dispose();
  }

  void _selectOffer(int index) {
    final offer = _offers[index];
    setState(() {
      _selectedOfferIndex = index;
      _amountController.text = offer.amount.toString();
      _amountController.selection = TextSelection.fromPosition(
        TextPosition(offset: _amountController.text.length),
      );
    });
  }

  Future<void> _openDepositPage() async {
    final amount = double.tryParse(_amountController.text.trim()) ?? 0;
    if (amount <= 0) {
      _showMessage('Please enter a valid deposit amount.');
      return;
    }

    FocusScope.of(context).unfocus();
    setState(() => _openingPayment = true);

    try {
      await WalletApi.createDepositOrder(amount: amount, paymentMethod: 'UPI');
      if (!mounted) return;
      setState(() {
        _amountController.clear();
        _selectedOfferIndex = null;
      });
    } catch (e) {
      if (!mounted) return;
      _showMessage(
        e.toString().replaceFirst('Exception: ', ''),
        error: true,
      );
    } finally {
      if (mounted) setState(() => _openingPayment = false);
    }
  }

  void _showMessage(String message, {bool error = false}) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          content: Text(message, style: GoogleFonts.poppins()),
          backgroundColor: error ? Colors.redAccent : const Color(0xFF5E217C),
          behavior: SnackBarBehavior.floating,
        ),
      );
  }

  @override
  Widget build(BuildContext context) {
    final hasAmount = _amountController.text.trim().isNotEmpty;
    final amount = double.tryParse(_amountController.text.trim()) ?? 0;

    return Material(
      color: Colors.transparent,
      child: SingleChildScrollView(
        physics: const BouncingScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 28),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                'Add Cash',
                style: GoogleFonts.poppins(
                  color: Colors.white,
                  fontSize: 28,
                  fontWeight: FontWeight.w800,
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    'Total Balance',
                    style: GoogleFonts.poppins(
                      color: Colors.white54,
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  Row(
                    children: [
                      Text(
                        '₹${widget.currentBalance.toStringAsFixed(1)}',
                        style: GoogleFonts.inter(
                          color: Colors.white,
                          fontSize: 18,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      const SizedBox(width: 4),
                      SvgPicture.asset(
                        'Assets/nav_icon/wallet.svg',
                        width: 16,
                        height: 16,
                        colorFilter: const ColorFilter.mode(Colors.white, BlendMode.srcIn),
                      ),
                    ],
                  ),
                ],
              ),
            ],
          ),
          const SizedBox(height: 20),
          if (hasAmount) ...[
            Text(
              'You are adding',
              style: GoogleFonts.poppins(
                color: Colors.white70,
                fontSize: 13,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 6),
          ],
          Container(
            decoration: BoxDecoration(
              color: const Color(0xFF2C043C),
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: const Color(0xFF48085F), width: 1.2),
            ),
            child: Column(
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                  decoration: BoxDecoration(
                    color: const Color(0xFF6E098E),
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: const Color(0xFF9E25CB), width: 1.5),
                  ),
                  child: TextField(
                    controller: _amountController,
                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                    style: GoogleFonts.inter(
                      color: Colors.white,
                      fontSize: 25,
                      fontWeight: FontWeight.w800,
                    ),
                    decoration: InputDecoration(
                      prefixText: '₹ ',
                      prefixStyle: GoogleFonts.inter(
                        color: Colors.white,
                        fontSize: 25,
                        fontWeight: FontWeight.w800,
                      ),
                      hintText: 'Enter Amount',
                      hintStyle: GoogleFonts.poppins(
                        color: Colors.white70,
                        fontSize: 21,
                        fontWeight: FontWeight.w700,
                      ),
                      border: InputBorder.none,
                      isDense: true,
                      contentPadding: EdgeInsets.zero,
                    ),
                    onChanged: (_) {
                      if (_selectedOfferIndex != null) {
                        setState(() => _selectedOfferIndex = null);
                      }
                    },
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                  child: Row(
                    children: [
                      Container(
                        width: 22,
                        height: 22,
                        decoration: const BoxDecoration(
                          shape: BoxShape.circle,
                          color: Color(0xFF00E676),
                        ),
                        child: const Center(
                          child: Text(
                            '%',
                            style: TextStyle(
                              color: Colors.black,
                              fontSize: 12,
                              fontWeight: FontWeight.w900,
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(width: 9),
                      Text(
                        'Select offers to get ',
                        style: GoogleFonts.poppins(
                          color: Colors.white,
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      Text(
                        'Cashback',
                        style: GoogleFonts.poppins(
                          color: const Color(0xFF00E676),
                          fontSize: 13,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 22),
          Row(
            children: [
              Text(
                'Offers',
                style: GoogleFonts.poppins(
                  color: Colors.white,
                  fontSize: 21,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(width: 5),
              const Text('✨', style: TextStyle(fontSize: 19)),
            ],
          ),
          const SizedBox(height: 12),
          GridView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: _offers.length,
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 2,
              crossAxisSpacing: 12,
              mainAxisSpacing: 12,
              childAspectRatio: 1.65,
            ),
            itemBuilder: (context, index) {
              final offer = _offers[index];
              final selected = _selectedOfferIndex == index;
              return InkWell(
                onTap: () => _selectOffer(index),
                borderRadius: BorderRadius.circular(20),
                child: Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: const Color(0xFF35064A),
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(
                      color: selected ? const Color(0xFF00E676) : const Color(0xFF5E1678),
                      width: selected ? 2.5 : 1.2,
                    ),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text(
                            '₹${offer.amount}',
                            style: GoogleFonts.inter(
                              color: Colors.white,
                              fontSize: 22,
                              fontWeight: FontWeight.w900,
                            ),
                          ),
                          Icon(
                            selected ? Icons.check_circle_rounded : Icons.add_rounded,
                            color: selected ? const Color(0xFF00E676) : Colors.white70,
                            size: 25,
                          ),
                        ],
                      ),
                      Text(
                        '₹${offer.cashback} Cashback',
                        style: GoogleFonts.poppins(
                          color: const Color(0xFF00E676),
                          fontSize: 13,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ],
                  ),
                ),
              );
            },
          ),
          const SizedBox(height: 22),
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: const Color(0xFF2C043C),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: const Color(0xFF5E1678)),
            ),
            child: Row(
              children: [
                const Icon(Icons.open_in_browser_rounded, color: Color(0xFF00E676), size: 23),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    'UPI payment, QR and UTR verification will open on the payment webpage.',
                    style: GoogleFonts.poppins(
                      color: Colors.white70,
                      fontSize: 12,
                      fontWeight: FontWeight.w500,
                      height: 1.35,
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 14),
          SizedBox(
            width: double.infinity,
            height: 56,
            child: ElevatedButton(
              onPressed: _openingPayment ? null : _openDepositPage,
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF00E676),
                disabledBackgroundColor: const Color(0xFF356B50),
                foregroundColor: Colors.black,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(17)),
                elevation: 0,
              ),
              child: _openingPayment
                  ? const SizedBox(
                      width: 23,
                      height: 23,
                      child: CircularProgressIndicator(strokeWidth: 2.5),
                    )
                  : Text(
                      hasAmount ? 'DEPOSIT ₹${amount.toInt()}' : 'ENTER AMOUNT TO DEPOSIT',
                      style: GoogleFonts.poppins(
                        fontSize: 16,
                        fontWeight: FontWeight.w900,
                        letterSpacing: .3,
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
