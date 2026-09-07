import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../features/wallet/data/wallet_api.dart';
import '../core/api/api_client.dart';

class WithdrawScreen extends StatefulWidget {
  final double winningsBalance;
  final Function(double grossAmount, double netAmount, bool isDepositBack) onWithdrawCompleted;
  final VoidCallback onBackPressed;

  const WithdrawScreen({
    super.key,
    required this.winningsBalance,
    required this.onWithdrawCompleted,
    required this.onBackPressed,
  });

  @override
  State<WithdrawScreen> createState() => _WithdrawScreenState();
}

class _WithdrawScreenState extends State<WithdrawScreen> {
  int _currentStep = 0; // 0 = Enter Amount, 1 = Select Method
  final TextEditingController _amountController = TextEditingController();
  final TextEditingController _upiIdController = TextEditingController(text: '8296395205@apl');

  @override
  void initState() {
    super.initState();
    _amountController.addListener(() {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _amountController.dispose();
    _upiIdController.dispose();
    super.dispose();
  }

  double get _enteredAmount => double.tryParse(_amountController.text) ?? 0.0;

  bool get _isValidAmount {
    if (_enteredAmount < 25) return false;
    return _enteredAmount <= widget.winningsBalance;
  }

  void _proceedToSelectMethod() {
    if (!_isValidAmount) return;
    setState(() {
      _currentStep = 1;
    });
  }

  void _processWithdrawal({required bool isDepositBack}) async {
    final amount = _enteredAmount > 0 ? _enteredAmount : 25.0;
    final cashback = isDepositBack ? (amount * 0.01).clamp(0.0, 500.0) : 0.0;
    final fee = isDepositBack ? 0.0 : (amount * 0.05).clamp(1.0, 50.0);
    final netAmount = isDepositBack ? (amount + cashback) : (amount - fee);

    try {
      await WalletApi.withdrawCash(amount: amount, upiId: _upiIdController.text);
      widget.onWithdrawCompleted(amount, netAmount, isDepositBack);

      if (mounted) {
        _showWithdrawalSuccessModal(
          amount: amount,
          netAmount: netAmount,
          isDepositBack: isDepositBack,
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              e is ApiException ? e.message : 'Withdrawal failed. Check winnings balance and UPI ID.',
              style: GoogleFonts.poppins(),
            ),
            backgroundColor: Colors.redAccent,
          ),
        );
      }
    }
  }

  void _showWithdrawalSuccessModal({
    required double amount,
    required double netAmount,
    required bool isDepositBack,
  }) {
    final txId = '#991020203322655459';

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: const Color(0xFF230533),
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
              // Drag Pill
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

              // Green Checkmark Icon
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
                'Withdrawal Successful',
                style: GoogleFonts.poppins(
                  color: Colors.white,
                  fontSize: 20,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 6),

              // Amount
              Text(
                '₹${netAmount.toStringAsFixed(2)}',
                style: GoogleFonts.inter(
                  color: Colors.white,
                  fontSize: 36,
                  fontWeight: FontWeight.w900,
                ),
              ),
              const SizedBox(height: 12),

              // Subtitle note
              Text(
                isDepositBack
                    ? 'Added directly to your InGames Deposit balance'
                    : 'It may take upto 24 hours for it to reflect in\nyour UPI account',
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
                          decoration: TextDecoration.underline,
                          decorationColor: Colors.white38,
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

              const SizedBox(height: 22),

              // BACK TO MY WALLET Button
              SizedBox(
                width: double.infinity,
                height: 52,
                child: ElevatedButton(
                  onPressed: () {
                    Navigator.pop(ctx);
                    widget.onWithdrawCompleted(amount, netAmount, isDepositBack);
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
                    'BACK TO MY WALLET',
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

  @override
  Widget build(BuildContext context) {
    return Container(
      color: const Color(0xFF190226),
      child: SafeArea(
        child: _currentStep == 0 ? _buildStepEnterAmount() : _buildStepSelectMethod(),
      ),
    );
  }

  // --------------------------------------------------------------------------
  // STEP 1: Enter Amount
  // --------------------------------------------------------------------------
  Widget _buildStepEnterAmount() {
    final winningsStr = widget.winningsBalance.toStringAsFixed(2);

    return Stack(
      children: [
        // Watermark floating coin circles background
        Positioned(
          top: -30,
          right: -30,
          child: Container(
            width: 140,
            height: 140,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: Colors.white.withValues(alpha: 0.03),
            ),
          ),
        ),
        Positioned(
          top: 60,
          left: -40,
          child: Container(
            width: 120,
            height: 120,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: Colors.white.withValues(alpha: 0.03),
            ),
          ),
        ),

        Column(
          children: [
            // Top Bar
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12.0, vertical: 8.0),
              child: Row(
                children: [
                  IconButton(
                    icon: const Icon(Icons.chevron_left_rounded, color: Colors.white, size: 30),
                    onPressed: widget.onBackPressed,
                  ),
                  Expanded(
                    child: Center(
                      child: Text(
                        'Withdraw',
                        style: GoogleFonts.poppins(
                          color: Colors.white,
                          fontSize: 20,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 48), // balance spacing
                ],
              ),
            ),

            const SizedBox(height: 12),

            // WINNINGS BALANCE Header
            Text(
              'WINNINGS BALANCE',
              style: GoogleFonts.poppins(
                color: Colors.white54,
                fontSize: 12,
                fontWeight: FontWeight.w600,
                letterSpacing: 1.0,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              '₹$winningsStr',
              style: GoogleFonts.inter(
                color: Colors.white,
                fontSize: 36,
                fontWeight: FontWeight.w900,
              ),
            ),

            const SizedBox(height: 36),

            // Input Form Section
            Expanded(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20.0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Enter Amount',
                      style: GoogleFonts.poppins(
                        color: Colors.white,
                        fontSize: 15,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 10),

                    // Input Box
                    AnimatedContainer(
                      duration: const Duration(milliseconds: 200),
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                      decoration: BoxDecoration(
                        color: const Color(0xFF2C073D),
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(
                          color: _amountController.text.isNotEmpty
                              ? const Color(0xFFFF2A6D)
                              : const Color(0xFF5A1678),
                          width: _amountController.text.isNotEmpty ? 1.8 : 1.0,
                        ),
                      ),
                      child: Row(
                        children: [
                          Text(
                            '₹ ',
                            style: GoogleFonts.inter(
                              color: Colors.white70,
                              fontSize: 22,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          Expanded(
                            child: TextField(
                              controller: _amountController,
                              keyboardType: TextInputType.number,
                              style: GoogleFonts.inter(
                                color: Colors.white,
                                fontSize: 22,
                                fontWeight: FontWeight.w700,
                              ),
                              decoration: InputDecoration(
                                hintText: 'Enter Amount',
                                hintStyle: GoogleFonts.poppins(
                                  color: Colors.white38,
                                  fontSize: 18,
                                  fontWeight: FontWeight.w500,
                                ),
                                border: InputBorder.none,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),

                    const SizedBox(height: 8),

                    // Helper limit text
                    Text(
                      'Min ₹25 - Max ₹5000 twice a day',
                      style: GoogleFonts.poppins(
                        color: _amountController.text.isNotEmpty
                            ? const Color(0xFFFF2A6D)
                            : Colors.white54,
                        fontSize: 12,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ],
                ),
              ),
            ),

            // Bottom Instant Withdrawals & NEXT Button
            Padding(
              padding: const EdgeInsets.all(20.0),
              child: Column(
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const Icon(
                        Icons.shield_outlined,
                        color: Colors.white60,
                        size: 16,
                      ),
                      const SizedBox(width: 6),
                      Text(
                        'Instant Withdrawals',
                        style: GoogleFonts.poppins(
                          color: Colors.white60,
                          fontSize: 13,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),

                  SizedBox(
                    width: double.infinity,
                    height: 52,
                    child: ElevatedButton(
                      onPressed: _isValidAmount ? _proceedToSelectMethod : null,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: _isValidAmount
                            ? const Color(0xFF6B1884)
                            : const Color(0xFF331046),
                        disabledBackgroundColor: const Color(0xFF331046),
                        foregroundColor: Colors.white,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(16),
                        ),
                      ),
                      child: Text(
                        'NEXT',
                        style: GoogleFonts.poppins(
                          color: _isValidAmount ? Colors.white : Colors.white38,
                          fontSize: 16,
                          fontWeight: FontWeight.w800,
                          letterSpacing: 0.5,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ],
    );
  }

  // --------------------------------------------------------------------------
  // STEP 2: Select Method
  // --------------------------------------------------------------------------
  Widget _buildStepSelectMethod() {
    final amountToWithdraw = _enteredAmount > 0 ? _enteredAmount : 25.0;
    final depositBackCashback = (amountToWithdraw * 0.01).clamp(0.0, 500.0);
    final depositBackTotal = amountToWithdraw + depositBackCashback;

    final upiFee = (amountToWithdraw * 0.05).clamp(1.0, 50.0);
    final upiNetTotal = amountToWithdraw - upiFee;

    return Stack(
      children: [
        // Watermark floating coin shapes
        Positioned(
          top: -20,
          right: -20,
          child: Container(
            width: 140,
            height: 140,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: Colors.white.withValues(alpha: 0.03),
            ),
          ),
        ),
        Positioned(
          top: 80,
          left: -40,
          child: Container(
            width: 120,
            height: 120,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: Colors.white.withValues(alpha: 0.03),
            ),
          ),
        ),

        Column(
          children: [
            // Top Bar
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 14.0, vertical: 8.0),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  IconButton(
                    icon: const Icon(Icons.chevron_left_rounded, color: Colors.white, size: 30),
                    onPressed: () {
                      setState(() {
                        _currentStep = 0;
                      });
                    },
                  ),
                  Text(
                    'Withdraw',
                    style: GoogleFonts.poppins(
                      color: Colors.white,
                      fontSize: 20,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                    decoration: BoxDecoration(
                      color: const Color(0xFF6B1884),
                      borderRadius: BorderRadius.circular(20),
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
            ),

            const SizedBox(height: 12),

            // YOU ARE WITHDRAWING Header
            Text(
              'YOU ARE WITHDRAWING',
              style: GoogleFonts.poppins(
                color: Colors.white60,
                fontSize: 11,
                fontWeight: FontWeight.w600,
                letterSpacing: 1.0,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              '₹${amountToWithdraw.toInt()}',
              style: GoogleFonts.inter(
                color: Colors.white,
                fontSize: 38,
                fontWeight: FontWeight.w900,
              ),
            ),

            const SizedBox(height: 24),

            // Option Cards
            Expanded(
              child: ListView(
                padding: const EdgeInsets.symmetric(horizontal: 16.0),
                children: [
                  // --------------------------------------------------------------
                  // CARD 1: Deposit Back to Rush / InGames Wallet
                  // --------------------------------------------------------------
                  Container(
                    margin: const EdgeInsets.only(bottom: 16),
                    decoration: BoxDecoration(
                      color: const Color(0xFF240635),
                      borderRadius: BorderRadius.circular(18),
                      border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Padding(
                          padding: const EdgeInsets.all(16.0),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                                decoration: BoxDecoration(
                                  color: const Color(0xFFE91E63),
                                  borderRadius: BorderRadius.circular(6),
                                ),
                                child: Text(
                                  'NEW',
                                  style: GoogleFonts.poppins(
                                    color: Colors.white,
                                    fontSize: 9,
                                    fontWeight: FontWeight.w900,
                                  ),
                                ),
                              ),
                              const SizedBox(height: 8),
                              Text(
                                'Deposit Back to Rush Wallet',
                                style: GoogleFonts.poppins(
                                  color: Colors.white,
                                  fontSize: 16,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                              const SizedBox(height: 10),
                              Row(
                                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                children: [
                                  Row(
                                    children: [
                                      Text(
                                        '1% cashback',
                                        style: GoogleFonts.poppins(
                                          color: const Color(0xFF00E676),
                                          fontSize: 13,
                                          fontWeight: FontWeight.w700,
                                        ),
                                      ),
                                      Text(
                                        '(max ₹500)',
                                        style: GoogleFonts.poppins(
                                          color: Colors.white54,
                                          fontSize: 12,
                                        ),
                                      ),
                                    ],
                                  ),
                                  Text(
                                    '+ ₹${depositBackCashback.toStringAsFixed(2)}',
                                    style: GoogleFonts.inter(
                                      color: const Color(0xFF00E676),
                                      fontSize: 14,
                                      fontWeight: FontWeight.w800,
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 6),
                              Row(
                                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                children: [
                                  Text(
                                    'Withdrawal Fee',
                                    style: GoogleFonts.poppins(
                                      color: Colors.white70,
                                      fontSize: 13,
                                    ),
                                  ),
                                  Text(
                                    '₹0',
                                    style: GoogleFonts.inter(
                                      color: Colors.white,
                                      fontSize: 14,
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                                ],
                              ),
                            ],
                          ),
                        ),

                        // Bottom Strip in Card 1
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                          decoration: const BoxDecoration(
                            color: Color(0xFF6B1884),
                            borderRadius: BorderRadius.vertical(bottom: Radius.circular(17)),
                          ),
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Row(
                                children: [
                                  Container(
                                    width: 32,
                                    height: 32,
                                    decoration: const BoxDecoration(
                                      shape: BoxShape.circle,
                                      color: Color(0xFFD81B60),
                                    ),
                                    child: const Center(
                                      child: Text(
                                        'R',
                                        style: TextStyle(
                                          color: Colors.white,
                                          fontSize: 18,
                                          fontWeight: FontWeight.w900,
                                          fontStyle: FontStyle.italic,
                                        ),
                                      ),
                                    ),
                                  ),
                                  const SizedBox(width: 10),
                                  Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        'Rush',
                                        style: GoogleFonts.poppins(
                                          color: Colors.white,
                                          fontSize: 14,
                                          fontWeight: FontWeight.w800,
                                        ),
                                      ),
                                      Text(
                                        'Deposit Wallet',
                                        style: GoogleFonts.poppins(
                                          color: Colors.white70,
                                          fontSize: 11,
                                        ),
                                      ),
                                    ],
                                  ),
                                ],
                              ),
                              ElevatedButton(
                                onPressed: () => _processWithdrawal(isDepositBack: true),
                                style: ElevatedButton.styleFrom(
                                  backgroundColor: const Color(0xFF00E676),
                                  foregroundColor: const Color(0xFF003B15),
                                  shape: RoundedRectangleBorder(
                                    borderRadius: BorderRadius.circular(14),
                                  ),
                                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                                  elevation: 0,
                                ),
                                child: Text(
                                  'Get ₹${depositBackTotal.toStringAsFixed(2)}',
                                  style: GoogleFonts.inter(
                                    color: const Color(0xFF003B15),
                                    fontSize: 14,
                                    fontWeight: FontWeight.w900,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),

                  // --------------------------------------------------------------
                  // CARD 2: Withdraw via UPI
                  // --------------------------------------------------------------
                  Container(
                    margin: const EdgeInsets.only(bottom: 16),
                    decoration: BoxDecoration(
                      color: const Color(0xFF240635),
                      borderRadius: BorderRadius.circular(18),
                      border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Padding(
                          padding: const EdgeInsets.all(16.0),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'Withdraw via UPI',
                                style: GoogleFonts.poppins(
                                  color: Colors.white,
                                  fontSize: 16,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                              const SizedBox(height: 10),
                              Row(
                                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                children: [
                                  Row(
                                    children: [
                                      Text(
                                        'Withdrawal Fee ',
                                        style: GoogleFonts.poppins(
                                          color: Colors.white70,
                                          fontSize: 13,
                                        ),
                                      ),
                                      const Icon(
                                        Icons.info_outline_rounded,
                                        color: Colors.white54,
                                        size: 14,
                                      ),
                                    ],
                                  ),
                                  Text(
                                    '- ₹${upiFee.toStringAsFixed(2)}',
                                    style: GoogleFonts.inter(
                                      color: Colors.white70,
                                      fontSize: 14,
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                                ],
                              ),
                            ],
                          ),
                        ),

                        // Bottom Strip in Card 2
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                          decoration: const BoxDecoration(
                            color: Color(0xFF6B1884),
                            borderRadius: BorderRadius.vertical(bottom: Radius.circular(17)),
                          ),
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Row(
                                children: [
                                  SizedBox(
                                    width: 24,
                                    height: 18,
                                    child: CustomPaint(
                                      painter: UpiLogoPainter(),
                                    ),
                                  ),
                                  const SizedBox(width: 8),
                                  Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        'UPI',
                                        style: GoogleFonts.poppins(
                                          color: Colors.white,
                                          fontSize: 14,
                                          fontWeight: FontWeight.w800,
                                        ),
                                      ),
                                      Text(
                                        _upiIdController.text,
                                        style: GoogleFonts.poppins(
                                          color: Colors.white70,
                                          fontSize: 11,
                                        ),
                                      ),
                                    ],
                                  ),
                                ],
                              ),
                              ElevatedButton(
                                onPressed: () => _processWithdrawal(isDepositBack: false),
                                style: ElevatedButton.styleFrom(
                                  backgroundColor: const Color(0xFF6436E0),
                                  foregroundColor: Colors.white,
                                  shape: RoundedRectangleBorder(
                                    borderRadius: BorderRadius.circular(14),
                                  ),
                                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                                  elevation: 0,
                                ),
                                child: Text(
                                  'Get ₹${upiNetTotal.toStringAsFixed(2)}',
                                  style: GoogleFonts.inter(
                                    color: Colors.white,
                                    fontSize: 14,
                                    fontWeight: FontWeight.w900,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),

                  const SizedBox(height: 10),

                  Center(
                    child: TextButton(
                      onPressed: () {},
                      child: Text(
                        'Other methods ›',
                        style: GoogleFonts.poppins(
                          color: Colors.white54,
                          fontSize: 13,
                          fontWeight: FontWeight.w500,
                          decoration: TextDecoration.underline,
                          decorationColor: Colors.white38,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 20),
                ],
              ),
            ),
          ],
        ),
      ],
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
