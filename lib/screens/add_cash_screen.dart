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

  List<OfferData> get _offers {
    final data = DashboardSyncManager.dashboardData.value;
    final offersRaw = data['addCashOffers'];
    if (offersRaw is List && offersRaw.isNotEmpty) {
      final List<OfferData> parsed = [];
      for (var o in offersRaw) {
        if (o is Map) {
          final amt = (o['amount'] as num?)?.toInt() ?? 0;
          final cb = (o['cashback'] as num?)?.toInt() ?? 0;
          parsed.add(OfferData(amount: amt, cashback: cb));
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
    DashboardSyncManager.dashboardData.addListener(_onSyncDataChanged);
    _amountController.addListener(() {
      if (mounted) setState(() {});
    });
  }

  void _onSyncDataChanged() {
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    DashboardSyncManager.dashboardData.removeListener(_onSyncDataChanged);
    _amountController.dispose();
    super.dispose();
  }

  void _selectOffer(int index) {
    setState(() {
      _selectedOfferIndex = index;
      _amountController.text = _offers[index].amount.toString();
    });
  }

  void _completePayment(String method) async {
    final enteredAmount = double.tryParse(_amountController.text) ?? 0;
    if (enteredAmount <= 0) return;

    try {
      final res = await WalletApi.createDepositOrder(amount: enteredAmount, paymentMethod: method);
      final data = res['data'] as Map<String, dynamic>? ?? {};
      final depositId = data['depositId']?.toString() ?? 'DEP_PENDING';

      setState(() {
        _amountController.clear();
        _selectedOfferIndex = null;
      });

      if (mounted) {
        _showDepositSuccessBottomSheet(context, enteredAmount, depositId);
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Deposit error: ${e.toString()}')),
        );
      }
    }
  }

  void _showDepositSuccessBottomSheet(BuildContext context, double amount, String txId) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: const Color(0xFF240435),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (ctx) {
        return Container(
          padding: EdgeInsets.only(
            left: 20.0,
            right: 20.0,
            top: 14.0,
            bottom: MediaQuery.of(ctx).viewInsets.bottom + 24.0,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              // Top drag indicator pill
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(
                    color: Colors.white30,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              const SizedBox(height: 24),

              // Green checkmark icon
              Container(
                width: 68,
                height: 68,
                decoration: const BoxDecoration(
                  color: Color(0xFF00E676),
                  shape: BoxShape.circle,
                ),
                child: const Icon(
                  Icons.check_rounded,
                  color: Colors.white,
                  size: 46,
                ),
              ),
              const SizedBox(height: 18),

              // Title
              Text(
                'Deposit Request Created',
                style: GoogleFonts.poppins(
                  color: Colors.white,
                  fontSize: 20,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 6),

              // Amount
              Text(
                '₹${amount.toInt()}',
                style: GoogleFonts.inter(
                  color: Colors.white,
                  fontSize: 36,
                  fontWeight: FontWeight.w900,
                ),
              ),
              const SizedBox(height: 12),

              // Subtitle note
              Text(
                'It may take upto 24 hours for it to reflect in\nyour wallet',
                textAlign: TextAlign.center,
                style: GoogleFonts.poppins(
                  color: Colors.white60,
                  fontSize: 13,
                  fontWeight: FontWeight.w400,
                  height: 1.4,
                ),
              ),
              const SizedBox(height: 28),

              // Transaction ID & Need Help Row
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Transaction ID',
                        style: GoogleFonts.poppins(
                          color: Colors.white54,
                          fontSize: 12,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        txId,
                        style: GoogleFonts.inter(
                          color: Colors.white.withValues(alpha: 0.9),
                          fontSize: 13,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                  ),
                  InkWell(
                    onTap: () {
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(
                          content: Text(
                            'Support team notified for $txId',
                            style: GoogleFonts.poppins(),
                          ),
                          backgroundColor: const Color(0xFF5E217C),
                          behavior: SnackBarBehavior.floating,
                        ),
                      );
                    },
                    borderRadius: BorderRadius.circular(16),
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                      decoration: BoxDecoration(
                        color: const Color(0xFF38104D),
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(color: const Color(0xFF5E217C)),
                      ),
                      child: Row(
                        children: [
                          const Icon(
                            Icons.help_outline_rounded,
                            color: Colors.white,
                            size: 18,
                          ),
                          const SizedBox(width: 6),
                          Text(
                            'Need Help',
                            style: GoogleFonts.poppins(
                              color: Colors.white,
                              fontSize: 13,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),

              const SizedBox(height: 18),

              // Transaction History Button Container
              InkWell(
                onTap: () {
                  Navigator.pop(ctx);
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      content: Text(
                        'Opening Transaction History',
                        style: GoogleFonts.poppins(),
                      ),
                      backgroundColor: const Color(0xFF5E217C),
                      behavior: SnackBarBehavior.floating,
                    ),
                  );
                },
                borderRadius: BorderRadius.circular(16),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 16),
                  decoration: BoxDecoration(
                    color: const Color(0xFF38104D),
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: const Color(0xFF5E217C)),
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        'Transaction History',
                        style: GoogleFonts.poppins(
                          color: Colors.white,
                          fontSize: 16,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const Icon(
                        Icons.chevron_right_rounded,
                        color: Colors.white,
                        size: 24,
                      ),
                    ],
                  ),
                ),
              ),

              const SizedBox(height: 20),

              // BACK TO HOME Button
              SizedBox(
                width: double.infinity,
                height: 52,
                child: ElevatedButton(
                  onPressed: () {
                    Navigator.pop(ctx);
                  },
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.white,
                    foregroundColor: const Color(0xFF4A1063),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(16),
                    ),
                    elevation: 4,
                  ),
                  child: Text(
                    'BACK TO HOME',
                    style: GoogleFonts.poppins(
                      color: const Color(0xFF5B127A),
                      fontSize: 16,
                      fontWeight: FontWeight.w900,
                      letterSpacing: 0.5,
                    ),
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  void _showPaymentBottomSheet(BuildContext context) {
    final enteredAmount = double.tryParse(_amountController.text) ?? 0;
    if (enteredAmount <= 0) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            'Please enter a valid amount',
            style: GoogleFonts.poppins(),
          ),
          backgroundColor: Colors.redAccent,
          behavior: SnackBarBehavior.floating,
        ),
      );
      return;
    }

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: const Color(0xFF1B0326),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (ctx) {
        return _PaymentBottomSheetWidget(
          enteredAmount: enteredAmount,
          onPaymentSelected: (method) {
            Navigator.pop(ctx);
            _completePayment(method);
          },
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final hasInput = _amountController.text.isNotEmpty;

    return SingleChildScrollView(
      physics: const BouncingScrollPhysics(),
      padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 12.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Top Header: "Add Cash" title + "Total Balance ₹1250.0 💳"
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              Text(
                'Add Cash',
                style: GoogleFonts.poppins(
                  color: Colors.white,
                  fontSize: 26,
                  fontWeight: FontWeight.w800,
                  letterSpacing: -0.3,
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

          const SizedBox(height: 16),



          // Label above input when typing / adding amount
          if (hasInput) ...[
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

          // Enter Amount Container matching reference screenshot exactly
          Container(
            decoration: BoxDecoration(
              color: const Color(0xFF2C043C), // Dark purple outer base
              borderRadius: BorderRadius.circular(20.0),
              border: Border.all(
                color: const Color(0xFF48085F),
                width: 1.2,
              ),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.4),
                  blurRadius: 10,
                  offset: const Offset(0, 5),
                ),
              ],
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Top Lighter Purple Input Pill Card with Light Purple Border
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 14.0),
                  decoration: BoxDecoration(
                    color: const Color(0xFF6E098E), // Lighter purple top card background
                    borderRadius: BorderRadius.circular(16.0),
                    border: Border.all(
                      color: const Color(0xFF9E25CB).withValues(alpha: 0.8),
                      width: 1.5,
                    ),
                  ),
                  child: TextField(
                    controller: _amountController,
                    keyboardType: TextInputType.number,
                    style: GoogleFonts.inter(
                      color: Colors.white,
                      fontSize: 24,
                      fontWeight: FontWeight.w800,
                    ),
                    decoration: InputDecoration(
                      prefixText: '₹ ',
                      prefixStyle: GoogleFonts.inter(
                        color: Colors.white,
                        fontSize: 24,
                        fontWeight: FontWeight.w800,
                      ),
                      hintText: 'Enter Amount',
                      hintStyle: GoogleFonts.poppins(
                        color: Colors.white.withValues(alpha: 0.7),
                        fontSize: 22,
                        fontWeight: FontWeight.w700,
                      ),
                      border: InputBorder.none,
                      isDense: true,
                      contentPadding: EdgeInsets.zero,
                    ),
                    onChanged: (val) {
                      setState(() {
                        _selectedOfferIndex = null;
                      });
                    },
                  ),
                ),

                // Bottom Strip: Green % badge + "Add amount & get Cashback"
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 12.0),
                  child: Row(
                    children: [
                      // Green circular badge with % icon
                      Container(
                        width: 20,
                        height: 20,
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
                      const SizedBox(width: 8),
                      Text(
                        hasInput ? 'Select offers to get ' : 'Add amount & get ',
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

          const SizedBox(height: 20),

          // Offers Section Title
          Text(
            'Offers ✨',
            style: GoogleFonts.poppins(
              color: Colors.white,
              fontSize: 16,
              fontWeight: FontWeight.w700,
            ),
          ),

          const SizedBox(height: 12),

          // 2x2 Grid of Offers Cards matching reference image exactly
          GridView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: _offers.length,
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 2,
              childAspectRatio: 1.85,
              crossAxisSpacing: 12,
              mainAxisSpacing: 14,
            ),
            itemBuilder: (context, index) {
              final offer = _offers[index];
              final isSelected = _selectedOfferIndex == index;

              return GestureDetector(
                onTap: () => _selectOffer(index),
                child: Container(
                  decoration: BoxDecoration(
                    color: isSelected
                        ? const Color(0xFF380749)
                        : const Color(0xFF2B043A), // Outer 3D bottom lip
                    borderRadius: BorderRadius.circular(20),
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withValues(alpha: 0.5),
                        blurRadius: 8,
                        offset: const Offset(0, 4),
                      ),
                    ],
                  ),
                  child: Container(
                    margin: const EdgeInsets.only(bottom: 5), // 3D Extrusion lip height
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                    decoration: BoxDecoration(
                      color: isSelected
                          ? const Color(0xFF7B189D)
                          : const Color(0xFF5B0A7B),
                      borderRadius: BorderRadius.circular(18),
                      border: Border.all(
                        color: isSelected
                            ? const Color(0xFF00E676)
                            : const Color(0xFF8B25B3).withValues(alpha: 0.6),
                        width: isSelected ? 2.0 : 1.5,
                      ),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        // Top Row: Amount (Left) + Plus Sign (Right)
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          crossAxisAlignment: CrossAxisAlignment.center,
                          children: [
                            Text(
                              '₹${offer.amount}',
                              style: GoogleFonts.inter(
                                color: Colors.white,
                                fontSize: 26,
                                fontWeight: FontWeight.w900,
                                letterSpacing: -0.5,
                                shadows: const [
                                  Shadow(
                                    color: Colors.black45,
                                    offset: Offset(1, 2),
                                    blurRadius: 3,
                                  ),
                                ],
                              ),
                            ),
                            Text(
                              '+',
                              style: GoogleFonts.poppins(
                                color: Colors.white,
                                fontSize: 24,
                                fontWeight: FontWeight.w700,
                                shadows: const [
                                  Shadow(
                                    color: Colors.black45,
                                    offset: Offset(1, 2),
                                    blurRadius: 3,
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),

                        // Bottom Row: Cashback text (Left)
                        Text(
                          '₹${offer.cashback} Cashback',
                          style: GoogleFonts.inter(
                            color: const Color(0xFF00E676),
                            fontSize: 14,
                            fontWeight: FontWeight.w800,
                            shadows: const [
                              Shadow(
                                color: Colors.black54,
                                offset: Offset(1, 1),
                                blurRadius: 2,
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              );
            },
          ),



          const SizedBox(height: 16),

          // Action Button: Triggers Mobile Optimized Bottom Sheet Popup
          SizedBox(
            width: double.infinity,
            height: 52,
            child: ElevatedButton(
              style: ElevatedButton.styleFrom(
                backgroundColor: hasInput
                    ? const Color(0xFF00E676)
                    : const Color(0xFF3B104B),
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(16),
                ),
                elevation: hasInput ? 8 : 2,
              ),
              onPressed: () => _showPaymentBottomSheet(context),
              child: Text(
                hasInput
                    ? 'ADD ₹${_amountController.text}'
                    : 'ADD CASH',
                style: GoogleFonts.inter(
                  color: hasInput ? Colors.black87 : Colors.white54,
                  fontSize: 17,
                  fontWeight: FontWeight.w900,
                  letterSpacing: 0.5,
                ),
              ),
            ),
          ),

          const SizedBox(height: 16),
        ],
      ),
    );
  }
}

class _PaymentBottomSheetWidget extends StatefulWidget {
  final double enteredAmount;
  final ValueChanged<String> onPaymentSelected;

  const _PaymentBottomSheetWidget({
    required this.enteredAmount,
    required this.onPaymentSelected,
  });

  @override
  State<_PaymentBottomSheetWidget> createState() => _PaymentBottomSheetWidgetState();
}

class _PaymentBottomSheetWidgetState extends State<_PaymentBottomSheetWidget> {
  int _selectedAppIndex = 2; // Default to Paytm UPI (index 2)
  bool _isAutoDetecting = true;

  final List<Map<String, String>> _upiApps = const [
    {
      'name': 'Google Pay',
      'id': 'gpay',
      'label': 'Google Pay',
    },
    {
      'name': 'PhonePe',
      'id': 'phonepe',
      'label': 'PhonePe',
    },
    {
      'name': 'Paytm UPI',
      'id': 'paytm',
      'label': 'Paytm UPI',
    },
    {
      'name': 'AmazonPay',
      'id': 'amazon',
      'label': 'AmazonPay',
    },
  ];

  @override
  void initState() {
    super.initState();
    Future.delayed(const Duration(milliseconds: 350), () {
      if (mounted) {
        setState(() {
          _isAutoDetecting = false;
        });
      }
    });
  }

  Widget _buildUpiHeaderLogo() {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        SizedBox(
          width: 24,
          height: 18,
          child: CustomPaint(
            painter: UpiLogoPainter(),
          ),
        ),
        const SizedBox(width: 6),
        Text(
          'UPI',
          style: GoogleFonts.poppins(
            color: Colors.white,
            fontSize: 18,
            fontWeight: FontWeight.w900,
            fontStyle: FontStyle.italic,
            letterSpacing: 0.5,
          ),
        ),
      ],
    );
  }

  Widget _buildGPayIcon({double size = 52}) {
    return Container(
      width: size,
      height: size,
      decoration: const BoxDecoration(
        shape: BoxShape.circle,
        color: Colors.white,
      ),
      child: Center(
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(
              'G',
              style: GoogleFonts.poppins(
                color: const Color(0xFF4285F4),
                fontSize: size * 0.38,
                fontWeight: FontWeight.w900,
              ),
            ),
            Text(
              'Pay',
              style: GoogleFonts.poppins(
                color: const Color(0xFF5F6368),
                fontSize: size * 0.32,
                fontWeight: FontWeight.w700,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildPhonePeIcon({double size = 52}) {
    return Container(
      width: size,
      height: size,
      decoration: const BoxDecoration(
        shape: BoxShape.circle,
        color: Color(0xFF5F259F),
      ),
      child: Center(
        child: Text(
          'पे',
          style: GoogleFonts.poppins(
            color: Colors.white,
            fontSize: size * 0.48,
            fontWeight: FontWeight.w900,
          ),
        ),
      ),
    );
  }

  Widget _buildPaytmIcon({double size = 52}) {
    return Container(
      width: size,
      height: size,
      decoration: const BoxDecoration(
        shape: BoxShape.circle,
        color: Colors.white,
      ),
      child: Center(
        child: RichText(
          text: TextSpan(
            children: [
              TextSpan(
                text: 'pay',
                style: GoogleFonts.poppins(
                  color: const Color(0xFF002E6E),
                  fontSize: size * 0.28,
                  fontWeight: FontWeight.w900,
                ),
              ),
              TextSpan(
                text: 'tm',
                style: GoogleFonts.poppins(
                  color: const Color(0xFF00B9F1),
                  fontSize: size * 0.28,
                  fontWeight: FontWeight.w900,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildAmazonPayIcon({double size = 52}) {
    return Container(
      width: size,
      height: size,
      decoration: const BoxDecoration(
        shape: BoxShape.circle,
        color: Colors.white,
      ),
      child: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(
              'pay',
              style: GoogleFonts.poppins(
                color: const Color(0xFF232F3E),
                fontSize: size * 0.32,
                fontWeight: FontWeight.w800,
                height: 1.0,
              ),
            ),
            const SizedBox(height: 1),
            Container(
              width: size * 0.35,
              height: 2.5,
              decoration: BoxDecoration(
                color: const Color(0xFFFF9900),
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildAppCircle(String id, {double size = 52}) {
    switch (id) {
      case 'gpay':
        return _buildGPayIcon(size: size);
      case 'phonepe':
        return _buildPhonePeIcon(size: size);
      case 'paytm':
        return _buildPaytmIcon(size: size);
      case 'amazon':
        return _buildAmazonPayIcon(size: size);
      default:
        return _buildPaytmIcon(size: size);
    }
  }

  Widget _buildSelectedAppLogo(String id) {
    switch (id) {
      case 'paytm':
        return RichText(
          text: TextSpan(
            children: [
              TextSpan(
                text: 'pay',
                style: GoogleFonts.poppins(
                  color: Colors.white,
                  fontSize: 22,
                  fontWeight: FontWeight.w900,
                ),
              ),
              TextSpan(
                text: 'tm',
                style: GoogleFonts.poppins(
                  color: const Color(0xFF00B9F1),
                  fontSize: 22,
                  fontWeight: FontWeight.w900,
                ),
              ),
            ],
          ),
        );
      case 'phonepe':
        return Row(
          children: [
            _buildPhonePeIcon(size: 26),
            const SizedBox(width: 8),
            Text(
              'PhonePe',
              style: GoogleFonts.poppins(
                color: Colors.white,
                fontSize: 18,
                fontWeight: FontWeight.w800,
              ),
            ),
          ],
        );
      case 'gpay':
        return Row(
          children: [
            _buildGPayIcon(size: 26),
            const SizedBox(width: 8),
            Text(
              'Google Pay',
              style: GoogleFonts.poppins(
                color: Colors.white,
                fontSize: 18,
                fontWeight: FontWeight.w800,
              ),
            ),
          ],
        );
      case 'amazon':
        return Row(
          children: [
            _buildAmazonPayIcon(size: 26),
            const SizedBox(width: 8),
            Text(
              'AmazonPay',
              style: GoogleFonts.poppins(
                color: Colors.white,
                fontSize: 18,
                fontWeight: FontWeight.w800,
              ),
            ),
          ],
        );
      default:
        return const SizedBox();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: EdgeInsets.only(
        left: 20.0,
        right: 20.0,
        top: 14.0,
        bottom: MediaQuery.of(context).viewInsets.bottom + 24.0,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Top drag handle line
          Center(
            child: Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: Colors.white30,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          const SizedBox(height: 18),

          // Title & Amount Row
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Amount to be added',
                    style: GoogleFonts.poppins(
                      color: Colors.white,
                      fontSize: 18,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    'You get: ₹${widget.enteredAmount.toInt()} Deposit',
                    style: GoogleFonts.inter(
                      color: Colors.white54,
                      fontSize: 13,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ],
              ),
              Text(
                '₹${widget.enteredAmount.toInt()}',
                style: GoogleFonts.inter(
                  color: Colors.white,
                  fontSize: 24,
                  fontWeight: FontWeight.w900,
                ),
              ),
            ],
          ),

          const SizedBox(height: 18),
          const Divider(color: Colors.white12, height: 1),
          const SizedBox(height: 18),

          // UPI Header + Auto-detected badge
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              _buildUpiHeaderLogo(),
              AnimatedContainer(
                duration: const Duration(milliseconds: 300),
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: const Color(0xFF00E676).withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(
                    color: const Color(0xFF00E676).withValues(alpha: 0.4),
                  ),
                ),
                child: Row(
                  children: [
                    Container(
                      width: 7,
                      height: 7,
                      decoration: const BoxDecoration(
                        color: Color(0xFF00E676),
                        shape: BoxShape.circle,
                      ),
                    ),
                    const SizedBox(width: 6),
                    Text(
                      _isAutoDetecting ? 'Detecting apps...' : 'Auto-detected 4 Apps',
                      style: GoogleFonts.poppins(
                        color: const Color(0xFF00E676),
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),

          const SizedBox(height: 20),

          // 4 Circle Payment Apps Row
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: List.generate(_upiApps.length, (index) {
              final app = _upiApps[index];
              final isSelected = index == _selectedAppIndex;

              return GestureDetector(
                onTap: () {
                  setState(() {
                    _selectedAppIndex = index;
                  });
                },
                child: Column(
                  children: [
                    AnimatedContainer(
                      duration: const Duration(milliseconds: 200),
                      padding: const EdgeInsets.all(3),
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        border: Border.all(
                          color: isSelected
                              ? const Color(0xFF00E676)
                              : Colors.transparent,
                          width: 2.5,
                        ),
                        boxShadow: isSelected
                            ? [
                                BoxShadow(
                                  color: const Color(0xFF00E676).withValues(alpha: 0.35),
                                  blurRadius: 10,
                                  spreadRadius: 1,
                                )
                              ]
                            : [],
                      ),
                      child: _buildAppCircle(app['id']!),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      app['label']!,
                      style: GoogleFonts.poppins(
                        color: isSelected ? Colors.white : Colors.white70,
                        fontSize: 12,
                        fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
                      ),
                    ),
                  ],
                ),
              );
            }),
          ),

          const SizedBox(height: 22),

          // Selected App Wallet Bar (Matching Paytm / App bar in photo)
          InkWell(
            onTap: () {
              final selectedAppName = _upiApps[_selectedAppIndex]['name']!;
              widget.onPaymentSelected(selectedAppName);
            },
            borderRadius: BorderRadius.circular(16),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
              decoration: BoxDecoration(
                color: const Color(0xFF220830),
                borderRadius: BorderRadius.circular(16),
                border: Border.all(
                  color: const Color(0xFF6B1884),
                  width: 1.5,
                ),
                boxShadow: [
                  BoxShadow(
                    color: const Color(0xFF6B1884).withValues(alpha: 0.25),
                    blurRadius: 12,
                    spreadRadius: 1,
                  ),
                ],
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.all(8),
                        decoration: BoxDecoration(
                          color: Colors.white.withValues(alpha: 0.12),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: const Icon(
                          Icons.account_balance_wallet_rounded,
                          color: Colors.white,
                          size: 22,
                        ),
                      ),
                      const SizedBox(width: 14),
                      _buildSelectedAppLogo(_upiApps[_selectedAppIndex]['id']!),
                    ],
                  ),
                  const Icon(
                    Icons.chevron_right_rounded,
                    color: Colors.white,
                    size: 26,
                  ),
                ],
              ),
            ),
          ),

          const SizedBox(height: 14),

          // Other payment options link
          Center(
            child: TextButton(
              onPressed: () {
                widget.onPaymentSelected('Net Banking / Card');
              },
              child: Text(
                'Other payment options ›',
                style: GoogleFonts.poppins(
                  color: Colors.white54,
                  fontSize: 13,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class UpiLogoPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final greenPath = Path()
      ..moveTo(size.width * 0.45, 0)
      ..lineTo(size.width * 0.18, size.height)
      ..lineTo(0, size.height)
      ..lineTo(size.width * 0.27, 0)
      ..close();

    final greenPaint = Paint()
      ..color = const Color(0xFF00A35C)
      ..style = PaintingStyle.fill;
    canvas.drawPath(greenPath, greenPaint);

    final orangePath = Path()
      ..moveTo(size.width * 0.65, 0)
      ..lineTo(size.width * 0.38, size.height)
      ..lineTo(size.width * 0.52, size.height)
      ..lineTo(size.width * 0.8, 0)
      ..close();

    final orangePaint = Paint()
      ..color = const Color(0xFFED1C24)
      ..style = PaintingStyle.fill;
    canvas.drawPath(orangePath, orangePaint);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

