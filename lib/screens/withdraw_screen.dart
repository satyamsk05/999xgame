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

  String _upiId = '';
  String _upiName = '';
  String _bankAccount = '';
  String _bankIfsc = '';
  String _bankHolder = '';
  String _bankName = '';
  bool _isWithdrawing = false;

  @override
  void initState() {
    super.initState();
    _amountController.addListener(() {
      if (mounted) setState(() {});
    });
    _loadPayoutMethods();
  }

  Future<void> _loadPayoutMethods() async {
    try {
      final res = await WalletApi.getPayoutMethods();
      if (mounted) {
        setState(() {
          _upiId = res['upiId']?.toString() ?? '';
          _upiName = res['upiName']?.toString() ?? '';
          _bankAccount = res['bankAccountNumber']?.toString() ?? '';
          _bankIfsc = res['bankIfsc']?.toString() ?? '';
          _bankHolder = res['bankAccountHolder']?.toString() ?? '';
          _bankName = res['bankName']?.toString() ?? '';
        });
      }
    } catch (_) {}
  }

  @override
  void dispose() {
    _amountController.dispose();
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

  void _processWithdrawal({required String paymentMode, required bool isDepositBack}) async {
    if (_isWithdrawing) return;

    if (!isDepositBack) {
      if (paymentMode == 'UPI' && _upiId.isEmpty) {
        _showEditPayoutModal(focusUpi: true);
        return;
      }
      if (paymentMode == 'BANK' && (_bankAccount.isEmpty || _bankIfsc.isEmpty)) {
        _showEditPayoutModal(focusUpi: false);
        return;
      }
    }

    final amount = _enteredAmount > 0 ? _enteredAmount : 25.0;
    final cashback = isDepositBack ? (amount * 0.01).clamp(0.0, 500.0) : 0.0;
    final fee = isDepositBack ? 0.0 : (amount * 0.05).clamp(1.0, 50.0);
    final netAmount = isDepositBack ? (amount + cashback) : (amount - fee);

    setState(() => _isWithdrawing = true);

    try {
      final res = await WalletApi.withdrawCash(
        amount: amount,
        paymentMode: paymentMode,
        upiId: paymentMode == 'UPI' ? _upiId : null,
        upiName: paymentMode == 'UPI' ? _upiName : null,
        bankAccountNumber: paymentMode == 'BANK' ? _bankAccount : null,
        bankIfsc: paymentMode == 'BANK' ? _bankIfsc : null,
        bankAccountHolder: paymentMode == 'BANK' ? _bankHolder : null,
        bankName: paymentMode == 'BANK' ? _bankName : null,
      );

      final wData = res['data'] is Map<String, dynamic> ? res['data'] : res;
      final withdrawalId = wData['withdrawalId']?.toString() ?? wData['id']?.toString() ?? '#WDR_${DateTime.now().millisecondsSinceEpoch.toString().substring(7)}';

      setState(() => _isWithdrawing = false);
      widget.onWithdrawCompleted(amount, netAmount, isDepositBack);

      if (mounted) {
        _showWithdrawalSuccessModal(
          amount: amount,
          netAmount: netAmount,
          isDepositBack: isDepositBack,
          paymentMode: paymentMode,
          txId: withdrawalId,
        );
      }
    } catch (e) {
      setState(() => _isWithdrawing = false);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              e is ApiException ? e.message : 'Withdrawal failed: ${e.toString()}',
              style: GoogleFonts.poppins(),
            ),
            backgroundColor: Colors.redAccent,
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    }
  }

  void _showEditPayoutModal({required bool focusUpi}) {
    final upiCtrl = TextEditingController(text: _upiId);
    final upiNameCtrl = TextEditingController(text: _upiName);
    final bankAccCtrl = TextEditingController(text: _bankAccount);
    final bankIfscCtrl = TextEditingController(text: _bankIfsc);
    final bankHolderCtrl = TextEditingController(text: _bankHolder);
    final bankNameCtrl = TextEditingController(text: _bankName);
    bool isSaving = false;

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: const Color(0xFF1E042D),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (ctx) {
        return StatefulBuilder(
          builder: (modalCtx, setModalState) {
            return Padding(
              padding: EdgeInsets.only(
                left: 20.0,
                right: 20.0,
                top: 16.0,
                bottom: MediaQuery.of(modalCtx).viewInsets.bottom + 24.0,
              ),
              child: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Center(
                      child: Container(
                        width: 40,
                        height: 4,
                        decoration: BoxDecoration(
                          color: Colors.white24,
                          borderRadius: BorderRadius.circular(2),
                        ),
                      ),
                    ),
                    const SizedBox(height: 16),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Row(
                          children: [
                            Container(
                              padding: const EdgeInsets.all(6),
                              decoration: const BoxDecoration(
                                color: Color(0xFF00E676),
                                shape: BoxShape.circle,
                              ),
                              child: const Icon(Icons.account_balance_wallet_rounded, color: Colors.black, size: 18),
                            ),
                            const SizedBox(width: 10),
                            Text(
                              'Link Bank & UPI Account',
                              style: GoogleFonts.poppins(
                                color: Colors.white,
                                fontSize: 18,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ],
                        ),
                        IconButton(
                          icon: const Icon(Icons.close_rounded, color: Colors.white70),
                          onPressed: () => Navigator.pop(modalCtx),
                        ),
                      ],
                    ),
                    const SizedBox(height: 14),

                    // UPI SECTION
                    Container(
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        color: const Color(0xFF2C073D),
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(
                          color: focusUpi ? const Color(0xFF00E676) : Colors.white12,
                          width: focusUpi ? 1.5 : 1.0,
                        ),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                decoration: BoxDecoration(
                                  color: const Color(0xFF00E676),
                                  borderRadius: BorderRadius.circular(6),
                                ),
                                child: Text('UPI ID', style: GoogleFonts.poppins(color: Colors.black, fontSize: 11, fontWeight: FontWeight.w800)),
                              ),
                              const SizedBox(width: 8),
                              Text('Instant Payouts', style: GoogleFonts.poppins(color: Colors.white70, fontSize: 12)),
                            ],
                          ),
                          const SizedBox(height: 12),
                          TextField(
                            controller: upiCtrl,
                            autofocus: focusUpi,
                            style: GoogleFonts.inter(color: Colors.white, fontWeight: FontWeight.w600),
                            decoration: InputDecoration(
                              labelText: 'UPI VPA Address',
                              labelStyle: GoogleFonts.poppins(color: Colors.white60, fontSize: 13),
                              hintText: 'e.g. mobile@apl / name@okaxis',
                              hintStyle: GoogleFonts.poppins(color: Colors.white24),
                              filled: true,
                              fillColor: const Color(0xFF1E042D),
                              border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: Color(0xFF5A1678))),
                            ),
                          ),
                          const SizedBox(height: 10),
                          TextField(
                            controller: upiNameCtrl,
                            style: GoogleFonts.poppins(color: Colors.white),
                            decoration: InputDecoration(
                              labelText: 'UPI Account Holder Name (optional)',
                              labelStyle: GoogleFonts.poppins(color: Colors.white60, fontSize: 13),
                              hintText: 'Full Name on UPI',
                              hintStyle: GoogleFonts.poppins(color: Colors.white24),
                              filled: true,
                              fillColor: const Color(0xFF1E042D),
                              border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: Color(0xFF5A1678))),
                            ),
                          ),
                        ],
                      ),
                    ),

                    const SizedBox(height: 16),

                    // BANK ACCOUNT SECTION
                    Container(
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        color: const Color(0xFF2C073D),
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(
                          color: !focusUpi ? const Color(0xFF2196F3) : Colors.white12,
                          width: !focusUpi ? 1.5 : 1.0,
                        ),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                decoration: BoxDecoration(
                                  color: const Color(0xFF2196F3),
                                  borderRadius: BorderRadius.circular(6),
                                ),
                                child: Text('BANK ACCOUNT', style: GoogleFonts.poppins(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w800)),
                              ),
                              const SizedBox(width: 8),
                              Text('IMPS / NEFT Transfer', style: GoogleFonts.poppins(color: Colors.white70, fontSize: 12)),
                            ],
                          ),
                          const SizedBox(height: 12),
                          TextField(
                            controller: bankAccCtrl,
                            autofocus: !focusUpi,
                            keyboardType: TextInputType.number,
                            style: GoogleFonts.inter(color: Colors.white, fontWeight: FontWeight.w600),
                            decoration: InputDecoration(
                              labelText: 'Bank Account Number',
                              labelStyle: GoogleFonts.poppins(color: Colors.white60, fontSize: 13),
                              hintText: '9 to 18 digit account number',
                              hintStyle: GoogleFonts.poppins(color: Colors.white24),
                              filled: true,
                              fillColor: const Color(0xFF1E042D),
                              border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: Color(0xFF5A1678))),
                            ),
                          ),
                          const SizedBox(height: 10),
                          TextField(
                            controller: bankIfscCtrl,
                            textCapitalization: TextCapitalization.characters,
                            style: GoogleFonts.inter(color: Colors.white, fontWeight: FontWeight.w600),
                            decoration: InputDecoration(
                              labelText: 'IFSC Code',
                              labelStyle: GoogleFonts.poppins(color: Colors.white60, fontSize: 13),
                              hintText: 'e.g. SBIN0001234',
                              hintStyle: GoogleFonts.poppins(color: Colors.white24),
                              filled: true,
                              fillColor: const Color(0xFF1E042D),
                              border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: Color(0xFF5A1678))),
                            ),
                          ),
                          const SizedBox(height: 10),
                          TextField(
                            controller: bankHolderCtrl,
                            style: GoogleFonts.poppins(color: Colors.white),
                            decoration: InputDecoration(
                              labelText: 'Account Holder Name',
                              labelStyle: GoogleFonts.poppins(color: Colors.white60, fontSize: 13),
                              hintText: 'Name as per Passbook',
                              hintStyle: GoogleFonts.poppins(color: Colors.white24),
                              filled: true,
                              fillColor: const Color(0xFF1E042D),
                              border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: Color(0xFF5A1678))),
                            ),
                          ),
                          const SizedBox(height: 10),
                          TextField(
                            controller: bankNameCtrl,
                            style: GoogleFonts.poppins(color: Colors.white),
                            decoration: InputDecoration(
                              labelText: 'Bank Name (optional)',
                              labelStyle: GoogleFonts.poppins(color: Colors.white60, fontSize: 13),
                              hintText: 'e.g. State Bank of India, HDFC',
                              hintStyle: GoogleFonts.poppins(color: Colors.white24),
                              filled: true,
                              fillColor: const Color(0xFF1E042D),
                              border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: Color(0xFF5A1678))),
                            ),
                          ),
                        ],
                      ),
                    ),

                    const SizedBox(height: 20),

                    // SAVE BUTTON
                    SizedBox(
                      width: double.infinity,
                      height: 50,
                      child: ElevatedButton(
                        onPressed: isSaving
                            ? null
                            : () async {
                                setModalState(() => isSaving = true);
                                final messenger = ScaffoldMessenger.of(context);
                                try {
                                  await WalletApi.savePayoutMethods(
                                    upiId: upiCtrl.text.trim(),
                                    upiName: upiNameCtrl.text.trim(),
                                    bankAccountNumber: bankAccCtrl.text.trim(),
                                    bankIfsc: bankIfscCtrl.text.trim().toUpperCase(),
                                    bankAccountHolder: bankHolderCtrl.text.trim(),
                                    bankName: bankNameCtrl.text.trim(),
                                  );

                                  if (mounted) {
                                    setState(() {
                                      _upiId = upiCtrl.text.trim();
                                      _upiName = upiNameCtrl.text.trim();
                                      _bankAccount = bankAccCtrl.text.trim();
                                      _bankIfsc = bankIfscCtrl.text.trim().toUpperCase();
                                      _bankHolder = bankHolderCtrl.text.trim();
                                      _bankName = bankNameCtrl.text.trim();
                                    });
                                    if (modalCtx.mounted) {
                                      Navigator.pop(modalCtx);
                                    }
                                    messenger.showSnackBar(
                                      SnackBar(
                                        content: Text('Payout details linked successfully!', style: GoogleFonts.poppins()),
                                        backgroundColor: const Color(0xFF00E676),
                                        behavior: SnackBarBehavior.floating,
                                      ),
                                    );
                                  }
                                } catch (e) {
                                  setModalState(() => isSaving = false);
                                  messenger.showSnackBar(
                                    SnackBar(
                                      content: Text('Failed: ${e.toString()}', style: GoogleFonts.poppins()),
                                      backgroundColor: Colors.redAccent,
                                      behavior: SnackBarBehavior.floating,
                                    ),
                                  );
                                }
                              },
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFF00E676),
                          foregroundColor: Colors.black,
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                        ),
                        child: isSaving
                            ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.black))
                            : Text(
                                'SAVE & LINK DETAILS',
                                style: GoogleFonts.poppins(fontSize: 15, fontWeight: FontWeight.w800, letterSpacing: 0.5),
                              ),
                      ),
                    ),
                  ],
                ),
              ),
            );
          },
        );
      },
    );
  }

  void _showWithdrawalSuccessModal({
    required double amount,
    required double netAmount,
    required bool isDepositBack,
    required String paymentMode,
    required String txId,
  }) {
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

              Text(
                'Withdrawal Requested',
                style: GoogleFonts.poppins(
                  color: Colors.white,
                  fontSize: 20,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 6),

              Text(
                '₹${netAmount.toStringAsFixed(2)}',
                style: GoogleFonts.inter(
                  color: Colors.white,
                  fontSize: 36,
                  fontWeight: FontWeight.w900,
                ),
              ),
              const SizedBox(height: 12),

              Text(
                isDepositBack
                    ? 'Added directly to your InGames Deposit balance'
                    : paymentMode == 'BANK'
                        ? 'Settlement request received for Bank Account.\nFunds will be credited within 24 hours.'
                        : 'Settlement request received for UPI ID.\nFunds will be credited within 24 hours.',
                textAlign: TextAlign.center,
                style: GoogleFonts.poppins(
                  color: Colors.white60,
                  fontSize: 13,
                  fontWeight: FontWeight.w400,
                  height: 1.4,
                ),
              ),
              const SizedBox(height: 28),

              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Withdrawal ID',
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
                          content: Text('Support team notified for $txId', style: GoogleFonts.poppins()),
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
                          const Icon(Icons.help_outline_rounded, color: Colors.white, size: 18),
                          const SizedBox(width: 6),
                          Text(
                            'Need Help',
                            style: GoogleFonts.poppins(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w600),
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),

              const SizedBox(height: 22),

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
    return Material(
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
                  const SizedBox(width: 48),
                ],
              ),
            ),

            const SizedBox(height: 12),

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
                        '100% Safe & Instant Settlement',
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
  // STEP 2: Select Method (UPI, BANK, DEPOSIT BACK)
  // --------------------------------------------------------------------------
  Widget _buildStepSelectMethod() {
    final amountToWithdraw = _enteredAmount > 0 ? _enteredAmount : 25.0;
    final depositBackCashback = (amountToWithdraw * 0.01).clamp(0.0, 500.0);
    final depositBackTotal = amountToWithdraw + depositBackCashback;

    final fee = (amountToWithdraw * 0.05).clamp(1.0, 50.0);
    final netTotal = amountToWithdraw - fee;

    final hasUpi = _upiId.isNotEmpty;
    final hasBank = _bankAccount.isNotEmpty && _bankIfsc.isNotEmpty;

    return Stack(
      children: [
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
                  const SizedBox(width: 48),
                ],
              ),
            ),

            const SizedBox(height: 12),

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

            Expanded(
              child: ListView(
                padding: const EdgeInsets.symmetric(horizontal: 16.0),
                children: [
                  // CARD 1: Withdraw via UPI
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
                              Row(
                                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                children: [
                                  Text(
                                    'Withdraw via UPI',
                                    style: GoogleFonts.poppins(
                                      color: Colors.white,
                                      fontSize: 16,
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                                  InkWell(
                                    onTap: () => _showEditPayoutModal(focusUpi: true),
                                    borderRadius: BorderRadius.circular(10),
                                    child: Container(
                                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                      decoration: BoxDecoration(
                                        color: const Color(0xFF4F106D),
                                        borderRadius: BorderRadius.circular(10),
                                        border: Border.all(color: const Color(0xFFFFD700).withValues(alpha: 0.5)),
                                      ),
                                      child: Row(
                                        children: [
                                          const Icon(Icons.edit_rounded, color: Color(0xFFFFD700), size: 11),
                                          const SizedBox(width: 4),
                                          Text(
                                            hasUpi ? 'Edit UPI' : '+ Link UPI',
                                            style: GoogleFonts.poppins(color: const Color(0xFFFFD700), fontSize: 11, fontWeight: FontWeight.w700),
                                          ),
                                        ],
                                      ),
                                    ),
                                  ),
                                ],
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
                                    '- ₹${fee.toStringAsFixed(2)}',
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
                                        'UPI ID',
                                        style: GoogleFonts.poppins(
                                          color: Colors.white,
                                          fontSize: 14,
                                          fontWeight: FontWeight.w800,
                                        ),
                                      ),
                                      Text(
                                        hasUpi ? _upiId : 'Tap to link UPI',
                                        style: GoogleFonts.poppins(
                                          color: hasUpi ? Colors.white70 : const Color(0xFFFFD700),
                                          fontSize: 11,
                                          fontWeight: hasUpi ? FontWeight.w500 : FontWeight.w700,
                                        ),
                                      ),
                                    ],
                                  ),
                                ],
                              ),
                              ElevatedButton(
                                onPressed: _isWithdrawing
                                    ? null
                                    : () => _processWithdrawal(paymentMode: 'UPI', isDepositBack: false),
                                style: ElevatedButton.styleFrom(
                                  backgroundColor: const Color(0xFF6436E0),
                                  foregroundColor: Colors.white,
                                  shape: RoundedRectangleBorder(
                                    borderRadius: BorderRadius.circular(14),
                                  ),
                                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                                  elevation: 0,
                                ),
                                child: _isWithdrawing
                                    ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                                    : Text(
                                        hasUpi ? 'Get ₹${netTotal.toStringAsFixed(2)}' : 'Link UPI',
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

                  // CARD 2: Withdraw via Bank Account
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
                              Row(
                                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                children: [
                                  Text(
                                    'Withdraw via Bank Account',
                                    style: GoogleFonts.poppins(
                                      color: Colors.white,
                                      fontSize: 16,
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                                  InkWell(
                                    onTap: () => _showEditPayoutModal(focusUpi: false),
                                    borderRadius: BorderRadius.circular(10),
                                    child: Container(
                                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                      decoration: BoxDecoration(
                                        color: const Color(0xFF4F106D),
                                        borderRadius: BorderRadius.circular(10),
                                        border: Border.all(color: const Color(0xFFFFD700).withValues(alpha: 0.5)),
                                      ),
                                      child: Row(
                                        children: [
                                          const Icon(Icons.edit_rounded, color: Color(0xFFFFD700), size: 11),
                                          const SizedBox(width: 4),
                                          Text(
                                            hasBank ? 'Edit Bank' : '+ Link Bank',
                                            style: GoogleFonts.poppins(color: const Color(0xFFFFD700), fontSize: 11, fontWeight: FontWeight.w700),
                                          ),
                                        ],
                                      ),
                                    ),
                                  ),
                                ],
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
                                    '- ₹${fee.toStringAsFixed(2)}',
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

                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                          decoration: const BoxDecoration(
                            color: Color(0xFF1E3A8A),
                            borderRadius: BorderRadius.vertical(bottom: Radius.circular(17)),
                          ),
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Row(
                                children: [
                                  Container(
                                    width: 28,
                                    height: 28,
                                    decoration: const BoxDecoration(
                                      shape: BoxShape.circle,
                                      color: Color(0xFF3B82F6),
                                    ),
                                    child: const Icon(Icons.account_balance_rounded, color: Colors.white, size: 16),
                                  ),
                                  const SizedBox(width: 8),
                                  Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        _bankName.isNotEmpty ? _bankName : 'Bank Transfer',
                                        style: GoogleFonts.poppins(
                                          color: Colors.white,
                                          fontSize: 14,
                                          fontWeight: FontWeight.w800,
                                        ),
                                      ),
                                      Text(
                                        hasBank
                                            ? '•••• ${_bankAccount.length > 4 ? _bankAccount.substring(_bankAccount.length - 4) : _bankAccount} ($_bankIfsc)'
                                            : 'Tap to link Bank A/C',
                                        style: GoogleFonts.poppins(
                                          color: hasBank ? Colors.white70 : const Color(0xFFFFD700),
                                          fontSize: 11,
                                          fontWeight: hasBank ? FontWeight.w500 : FontWeight.w700,
                                        ),
                                      ),
                                    ],
                                  ),
                                ],
                              ),
                              ElevatedButton(
                                onPressed: _isWithdrawing
                                    ? null
                                    : () => _processWithdrawal(paymentMode: 'BANK', isDepositBack: false),
                                style: ElevatedButton.styleFrom(
                                  backgroundColor: const Color(0xFF2563EB),
                                  foregroundColor: Colors.white,
                                  shape: RoundedRectangleBorder(
                                    borderRadius: BorderRadius.circular(14),
                                  ),
                                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                                  elevation: 0,
                                ),
                                child: _isWithdrawing
                                    ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                                    : Text(
                                        hasBank ? 'Get ₹${netTotal.toStringAsFixed(2)}' : 'Link Bank',
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

                  // CARD 3: Deposit Back to Rush / InGames Wallet
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
                                onPressed: () => _processWithdrawal(paymentMode: 'WALLET', isDepositBack: true),
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
