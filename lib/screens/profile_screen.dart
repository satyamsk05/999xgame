import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../theme/app_colors.dart';
import '../features/wallet/data/wallet_api.dart';

class ProfileScreen extends StatefulWidget {
  final String username;
  final String phoneNumber;
  final double walletBalance;
  final String avatarPath;
  final VoidCallback onAddCashTap;
  final VoidCallback? onContactSupportTap;
  final ValueChanged<String>? onAvatarChanged;
  final ValueChanged<String>? onUsernameChanged;
  final VoidCallback? onBackPressed;
  final VoidCallback? onTransactionHistoryTap;
  final VoidCallback? onSettingsTap;
  final VoidCallback? onLogoutTap;

  const ProfileScreen({
    super.key,
    this.username = 'Ashu K',
    this.phoneNumber = '+91727*****82',
    this.walletBalance = 1250.0,
    this.avatarPath = 'Assets/Avatar/avatar_1.png',
    required this.onAddCashTap,
    this.onContactSupportTap,
    this.onAvatarChanged,
    this.onUsernameChanged,
    this.onBackPressed,
    this.onTransactionHistoryTap,
    this.onSettingsTap,
    this.onLogoutTap,
  });

  static String normalizeAvatarPath(String? path) {
    if (path == null || path.isEmpty) return 'Assets/Avatar/avatar_1.png';
    String p = path.replaceAll('assets/avatar/', 'Assets/Avatar/').replaceAll('assets/Avatar/', 'Assets/Avatar/');
    if (!p.startsWith('Assets/Avatar/')) {
      final fileName = p.split('/').last;
      p = 'Assets/Avatar/$fileName';
    }
    return p;
  }

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  final List<String> _availableAvatars = const [
    'Assets/Avatar/avatar_1.png',
    'Assets/Avatar/avatar_2.png',
    'Assets/Avatar/avatar_3.png',
    'Assets/Avatar/avatar_7.png',
    'Assets/Avatar/avatar_8.png',
    'Assets/Avatar/avatar_9.png',
  ];

  String _bankAccount = '';
  String _bankIfsc = '';
  String _bankHolder = '';
  String _bankName = '';
  String _upiId = '';
  String _upiName = '';

  @override
  void initState() {
    super.initState();
    _loadPayoutMethods();
  }

  Future<void> _loadPayoutMethods() async {
    try {
      final res = await WalletApi.getPayoutMethods();
      if (mounted) {
        setState(() {
          _bankAccount = res['bankAccountNumber']?.toString() ?? '';
          _bankIfsc = res['bankIfsc']?.toString() ?? '';
          _bankHolder = res['bankAccountHolder']?.toString() ?? '';
          _bankName = res['bankName']?.toString() ?? '';
          _upiId = res['upiId']?.toString() ?? '';
          _upiName = res['upiName']?.toString() ?? '';
        });
      }
    } catch (_) {}
  }

  void _showAvatarSelectionDialog() {
    showDialog(
      context: context,
      builder: (context) {
        return Dialog(
          backgroundColor: Colors.transparent,
          insetPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 24),
          child: Container(
            constraints: const BoxConstraints(maxWidth: 360),
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: const Color(0xFF260838),
              borderRadius: BorderRadius.circular(24),
              border: Border.all(color: const Color(0xFFFFC107), width: 2),
              boxShadow: [
                BoxShadow(
                  color: const Color(0xFFFFC107).withValues(alpha: 0.3),
                  blurRadius: 20,
                  spreadRadius: 2,
                ),
              ],
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Row(
                      children: [
                        Container(
                          padding: const EdgeInsets.all(6),
                          decoration: const BoxDecoration(
                            color: Color(0xFFFFC107),
                            shape: BoxShape.circle,
                          ),
                          child: const Icon(
                            Icons.face_rounded,
                            color: Colors.black,
                            size: 18,
                          ),
                        ),
                        const SizedBox(width: 10),
                        Text(
                          'Choose DP Avatar',
                          style: GoogleFonts.poppins(
                            color: Colors.white,
                            fontSize: 18,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ],
                    ),
                    IconButton(
                      icon: const Icon(Icons.close_rounded, color: Colors.white70, size: 22),
                      padding: EdgeInsets.zero,
                      constraints: const BoxConstraints(),
                      onPressed: () => Navigator.pop(context),
                    ),
                  ],
                ),
                const SizedBox(height: 20),
                Flexible(
                  child: GridView.builder(
                    shrinkWrap: true,
                    physics: const BouncingScrollPhysics(),
                    gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                      crossAxisCount: 2,
                      crossAxisSpacing: 16,
                      mainAxisSpacing: 16,
                      childAspectRatio: 1.0,
                    ),
                    itemCount: _availableAvatars.length,
                    itemBuilder: (context, index) {
                      final path = _availableAvatars[index];
                      final isSelected = path == widget.avatarPath;
                      return GestureDetector(
                        onTap: () {
                          widget.onAvatarChanged?.call(path);
                          Navigator.pop(context);
                        },
                        child: AnimatedContainer(
                          duration: const Duration(milliseconds: 200),
                          padding: const EdgeInsets.all(4),
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            border: Border.all(
                              color: isSelected ? const Color(0xFFFFC107) : Colors.white24,
                              width: isSelected ? 3.5 : 1.5,
                            ),
                            boxShadow: isSelected
                                ? [
                                    BoxShadow(
                                      color: const Color(0xFFFFC107).withValues(alpha: 0.6),
                                      blurRadius: 12,
                                      spreadRadius: 2,
                                    ),
                                  ]
                                : [],
                          ),
                          child: ClipOval(
                            child: Image.asset(
                              ProfileScreen.normalizeAvatarPath(path),
                              fit: BoxFit.cover,
                              errorBuilder: (context, error, stackTrace) => Image.asset(
                                'Assets/Avatar/avatar_1.png',
                                fit: BoxFit.cover,
                              ),
                            ),
                          ),
                        ),
                      );
                    },
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  void _showEditNameDialog() {
    final controller = TextEditingController(text: widget.username);
    showDialog(
      context: context,
      builder: (context) {
        return AlertDialog(
          backgroundColor: const Color(0xFF260838),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(20),
            side: const BorderSide(color: Color(0xFF4F106D), width: 2),
          ),
          title: Text(
            'Edit Name',
            style: GoogleFonts.poppins(
              color: Colors.white,
              fontWeight: FontWeight.bold,
              fontSize: 18,
            ),
          ),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Enter your new account & display name:',
                style: GoogleFonts.poppins(
                  color: Colors.white70,
                  fontSize: 12,
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: controller,
                autofocus: true,
                style: GoogleFonts.poppins(color: Colors.white),
                decoration: InputDecoration(
                  hintText: 'Enter name',
                  hintStyle: GoogleFonts.poppins(color: Colors.white38),
                  filled: true,
                  fillColor: const Color(0xFF160324),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: const BorderSide(color: Color(0xFF4F106D)),
                  ),
                  focusedBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: const BorderSide(color: Color(0xFFFFD700)),
                  ),
                ),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: Text(
                'CANCEL',
                style: GoogleFonts.poppins(color: Colors.white54),
              ),
            ),
            ElevatedButton(
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF00B57F),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(10),
                ),
              ),
              onPressed: () {
                final newName = controller.text.trim();
                if (newName.isNotEmpty && widget.onUsernameChanged != null) {
                  widget.onUsernameChanged!(newName);
                }
                Navigator.pop(context);
              },
              child: Text(
                'SAVE',
                style: GoogleFonts.poppins(
                  color: Colors.white,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ),
          ],
        );
      },
    );
  }

  void _showEditPayoutModal() {
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
                              'Link Bank & UPI',
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
                        border: Border.all(color: Colors.white12),
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
                        border: Border.all(color: Colors.white12),
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
                                        content: Text('Payout methods updated & synced!', style: GoogleFonts.poppins()),
                                        backgroundColor: const Color(0xFF00E676),
                                        behavior: SnackBarBehavior.floating,
                                      ),
                                    );
                                  }
                                } catch (e) {
                                  setModalState(() => isSaving = false);
                                  messenger.showSnackBar(
                                    SnackBar(
                                      content: Text('Failed to update: ${e.toString()}', style: GoogleFonts.poppins()),
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

  @override
  Widget build(BuildContext context) {
    final hasUpi = _upiId.isNotEmpty;
    final hasBank = _bankAccount.isNotEmpty && _bankIfsc.isNotEmpty;

    return Material(
      color: Colors.transparent,
      child: SingleChildScrollView(
        physics: const BouncingScrollPhysics(),
        padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 12.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Top Title: "Account" with optional Back Arrow
            Row(
              children: [
                if (widget.onBackPressed != null) ...[
                  IconButton(
                    icon: const Icon(Icons.arrow_back_ios_new_rounded, color: Colors.white, size: 20),
                    onPressed: widget.onBackPressed,
                    padding: EdgeInsets.zero,
                    constraints: const BoxConstraints(),
                  ),
                  const SizedBox(width: 12),
                ],
                Text(
                  'Account',
                  style: GoogleFonts.poppins(
                    color: Colors.white,
                    fontSize: 26,
                    fontWeight: FontWeight.w800,
                    letterSpacing: -0.3,
                  ),
                ),
              ],
            ),

            const SizedBox(height: 16),

            // User Profile Card Header
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Left Column: Name with Edit Icon, Phone+KYC, Profile Pill Button
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      GestureDetector(
                        onTap: _showEditNameDialog,
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Flexible(
                              child: Text(
                                widget.username,
                                style: GoogleFonts.poppins(
                                  color: Colors.white,
                                  fontSize: 22,
                                  fontWeight: FontWeight.w700,
                                ),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                            const SizedBox(width: 8),
                            Container(
                              padding: const EdgeInsets.all(5),
                              decoration: BoxDecoration(
                                color: Colors.white.withValues(alpha: 0.15),
                                shape: BoxShape.circle,
                              ),
                              child: const Icon(
                                Icons.edit_rounded,
                                color: Color(0xFFFFD700),
                                size: 14,
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 6),

                      // Phone Number + KYC Verified Badge
                      Row(
                        children: [
                          Text(
                            widget.phoneNumber,
                            style: GoogleFonts.poppins(
                              color: Colors.white.withValues(alpha: 0.65),
                              fontSize: 13,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                          const SizedBox(width: 8),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                            decoration: BoxDecoration(
                              color: const Color(0xFF0085FF),
                              borderRadius: BorderRadius.circular(10),
                            ),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                const Icon(
                                  Icons.check_circle_rounded,
                                  color: Colors.white,
                                  size: 11,
                                ),
                                const SizedBox(width: 3),
                                Text(
                                  'KYC',
                                  style: GoogleFonts.poppins(
                                    color: Colors.white,
                                    fontSize: 10,
                                    fontWeight: FontWeight.w800,
                                    fontStyle: FontStyle.italic,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),

                      const SizedBox(height: 12),

                      // Profile Pill Button
                      InkWell(
                        onTap: () {},
                        borderRadius: BorderRadius.circular(16),
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 5),
                          decoration: BoxDecoration(
                            color: const Color(0xFF3B104B),
                            borderRadius: BorderRadius.circular(16),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Text(
                                'Profile',
                                style: GoogleFonts.poppins(
                                  color: Colors.white,
                                  fontSize: 12,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                              const SizedBox(width: 4),
                              const Icon(
                                Icons.play_arrow_rounded,
                                color: Colors.white,
                                size: 13,
                              ),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ),
                ),

                // Right Side: 3D Character Avatar Portrait with Edit Pencil Badge
                GestureDetector(
                  onTap: _showAvatarSelectionDialog,
                  child: Stack(
                    children: [
                      Container(
                        width: 78,
                        height: 78,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          border: Border.all(
                            color: AppColors.avatarBorder,
                            width: 2.0,
                          ),
                          boxShadow: [
                            BoxShadow(
                              color: AppColors.avatarBorder.withValues(alpha: 0.3),
                              blurRadius: 10,
                            ),
                          ],
                        ),
                        child: ClipOval(
                          child: Image.asset(
                            ProfileScreen.normalizeAvatarPath(widget.avatarPath),
                            width: 78,
                            height: 78,
                            fit: BoxFit.cover,
                            errorBuilder: (context, error, stackTrace) => Image.asset(
                              'Assets/Avatar/avatar_1.png',
                              width: 78,
                              height: 78,
                              fit: BoxFit.cover,
                            ),
                          ),
                        ),
                      ),
                      Positioned(
                        bottom: 0,
                        right: 0,
                        child: Container(
                          padding: const EdgeInsets.all(5),
                          decoration: BoxDecoration(
                            color: const Color(0xFFFFC107),
                            shape: BoxShape.circle,
                            border: Border.all(
                              color: const Color(0xFF280453),
                              width: 2,
                            ),
                            boxShadow: [
                              BoxShadow(
                                color: Colors.black.withValues(alpha: 0.4),
                                blurRadius: 4,
                              ),
                            ],
                          ),
                          child: const Icon(
                            Icons.edit_rounded,
                            size: 14,
                            color: Colors.black87,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),

            const SizedBox(height: 24),

            // Wallet Balance Card
            GestureDetector(
              onTap: widget.onAddCashTap,
              child: Container(
                padding: const EdgeInsets.all(20.0),
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: [
                      Color(0xFF4A148C),
                      Color(0xFF280453),
                    ],
                  ),
                  borderRadius: BorderRadius.circular(20.0),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withValues(alpha: 0.3),
                      blurRadius: 12,
                      offset: const Offset(0, 5),
                    ),
                  ],
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Text(
                                'WALLET BALANCE',
                                style: GoogleFonts.poppins(
                                  color: Colors.white.withValues(alpha: 0.55),
                                  fontSize: 11,
                                  fontWeight: FontWeight.w700,
                                  letterSpacing: 1.2,
                                ),
                              ),
                              const SizedBox(width: 6),
                              const Icon(
                                Icons.verified_user_rounded,
                                color: Color(0xFFFFC107),
                                size: 14,
                              ),
                            ],
                          ),
                          const SizedBox(height: 8),
                          Row(
                            children: [
                              Text(
                                '₹${widget.walletBalance.toStringAsFixed(2)}',
                                style: GoogleFonts.inter(
                                  color: Colors.white,
                                  fontSize: 26,
                                  fontWeight: FontWeight.w800,
                                  letterSpacing: 0.2,
                                ),
                              ),
                              const SizedBox(width: 6),
                              const Icon(
                                Icons.play_arrow_rounded,
                                color: Colors.white,
                                size: 16,
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),

                    // 3D Green Money Bag Illustration
                    Container(
                      width: 54,
                      height: 54,
                      decoration: BoxDecoration(
                        gradient: const LinearGradient(
                          colors: [Color(0xFF00E676), Color(0xFF00A574)],
                        ),
                        shape: BoxShape.circle,
                        boxShadow: [
                          BoxShadow(
                            color: const Color(0xFF00E676).withValues(alpha: 0.4),
                            blurRadius: 10,
                          ),
                        ],
                      ),
                      child: const Center(
                        child: Icon(
                          Icons.savings_rounded,
                          color: Colors.white,
                          size: 32,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),

            const SizedBox(height: 16),

            // LINKED PAYOUT METHODS (BANK & UPI) CARD
            Container(
              padding: const EdgeInsets.all(18.0),
              decoration: BoxDecoration(
                color: const Color(0xFF260636),
                borderRadius: BorderRadius.circular(20.0),
                border: Border.all(color: const Color(0xFF5A1678).withValues(alpha: 0.5)),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: 0.25),
                    blurRadius: 10,
                    offset: const Offset(0, 4),
                  ),
                ],
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
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
                            child: const Icon(Icons.payment_rounded, color: Colors.black, size: 16),
                          ),
                          const SizedBox(width: 8),
                          Text(
                            'PAYOUT METHODS',
                            style: GoogleFonts.poppins(
                              color: Colors.white.withValues(alpha: 0.7),
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                              letterSpacing: 1.1,
                            ),
                          ),
                        ],
                      ),
                      InkWell(
                        onTap: _showEditPayoutModal,
                        borderRadius: BorderRadius.circular(12),
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                          decoration: BoxDecoration(
                            color: const Color(0xFF4F106D),
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(color: const Color(0xFFFFD700).withValues(alpha: 0.6)),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              const Icon(Icons.edit_rounded, color: Color(0xFFFFD700), size: 12),
                              const SizedBox(width: 4),
                              Text(
                                hasUpi || hasBank ? 'EDIT' : '+ LINK',
                                style: GoogleFonts.poppins(
                                  color: const Color(0xFFFFD700),
                                  fontSize: 11,
                                  fontWeight: FontWeight.w800,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 14),

                  // UPI Preview Row
                  Row(
                    children: [
                      Container(
                        width: 32,
                        height: 32,
                        decoration: BoxDecoration(
                          color: const Color(0xFF00E676).withValues(alpha: 0.15),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: const Center(
                          child: Icon(Icons.qr_code_2_rounded, color: Color(0xFF00E676), size: 18),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'UPI ID',
                              style: GoogleFonts.poppins(color: Colors.white54, fontSize: 11, fontWeight: FontWeight.w500),
                            ),
                            Text(
                              hasUpi ? _upiId : 'Not linked yet',
                              style: GoogleFonts.inter(
                                color: hasUpi ? Colors.white : Colors.white38,
                                fontSize: 13,
                                fontWeight: hasUpi ? FontWeight.w700 : FontWeight.w500,
                              ),
                            ),
                          ],
                        ),
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                        decoration: BoxDecoration(
                          color: hasUpi ? const Color(0xFF00E676).withValues(alpha: 0.2) : Colors.white10,
                          borderRadius: BorderRadius.circular(6),
                        ),
                        child: Text(
                          hasUpi ? 'LINKED' : 'PENDING',
                          style: GoogleFonts.poppins(
                            color: hasUpi ? const Color(0xFF00E676) : Colors.white38,
                            fontSize: 9,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ),
                    ],
                  ),

                  const Padding(
                    padding: EdgeInsets.symmetric(vertical: 10.0),
                    child: Divider(color: Colors.white12, height: 1),
                  ),

                  // Bank Account Preview Row
                  Row(
                    children: [
                      Container(
                        width: 32,
                        height: 32,
                        decoration: BoxDecoration(
                          color: const Color(0xFF2196F3).withValues(alpha: 0.15),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: const Center(
                          child: Icon(Icons.account_balance_rounded, color: Color(0xFF2196F3), size: 18),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              _bankName.isNotEmpty ? _bankName : 'Bank Account',
                              style: GoogleFonts.poppins(color: Colors.white54, fontSize: 11, fontWeight: FontWeight.w500),
                            ),
                            Text(
                              hasBank
                                  ? '•••• ${_bankAccount.length > 4 ? _bankAccount.substring(_bankAccount.length - 4) : _bankAccount} ($_bankIfsc)'
                                  : 'Not linked yet',
                              style: GoogleFonts.inter(
                                color: hasBank ? Colors.white : Colors.white38,
                                fontSize: 13,
                                fontWeight: hasBank ? FontWeight.w700 : FontWeight.w500,
                              ),
                            ),
                          ],
                        ),
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                        decoration: BoxDecoration(
                          color: hasBank ? const Color(0xFF2196F3).withValues(alpha: 0.2) : Colors.white10,
                          borderRadius: BorderRadius.circular(6),
                        ),
                        child: Text(
                          hasBank ? 'LINKED' : 'PENDING',
                          style: GoogleFonts.poppins(
                            color: hasBank ? const Color(0xFF2196F3) : Colors.white38,
                            fontSize: 9,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),

            const SizedBox(height: 16),

            // Contact Support Card
            GestureDetector(
              onTap: widget.onContactSupportTap,
              child: Container(
                padding: const EdgeInsets.all(20.0),
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: [
                      Color(0xFF6A1B82),
                      Color(0xFF430E54),
                    ],
                  ),
                  borderRadius: BorderRadius.circular(20.0),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withValues(alpha: 0.3),
                      blurRadius: 12,
                      offset: const Offset(0, 5),
                    ),
                  ],
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'NEED ANY HELP?',
                          style: GoogleFonts.poppins(
                            color: Colors.white.withValues(alpha: 0.55),
                            fontSize: 11,
                            fontWeight: FontWeight.w700,
                            letterSpacing: 1.2,
                          ),
                        ),
                        const SizedBox(height: 6),
                        Row(
                          children: [
                            Text(
                              'Contact Support',
                              style: GoogleFonts.poppins(
                                color: Colors.white,
                                fontSize: 20,
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                            const SizedBox(width: 4),
                            const Icon(
                              Icons.play_arrow_rounded,
                              color: Colors.white,
                              size: 16,
                            ),
                          ],
                        ),
                      ],
                    ),

                    // Support Executive Headset Illustration
                    Container(
                      width: 50,
                      height: 50,
                      decoration: BoxDecoration(
                        color: Colors.purple.shade900,
                        shape: BoxShape.circle,
                        border: Border.all(color: Colors.purpleAccent, width: 1.5),
                      ),
                      child: const Center(
                        child: Icon(
                          Icons.support_agent_rounded,
                          color: Colors.white,
                          size: 30,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),

            const SizedBox(height: 16),

            // Transaction History & Settings List Container
            Material(
              color: const Color(0xFF2A063C),
              borderRadius: BorderRadius.circular(20.0),
              clipBehavior: Clip.antiAlias,
              child: Container(
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(20.0),
                  border: Border.all(
                    color: Colors.purple.shade800.withValues(alpha: 0.4),
                  ),
                ),
                child: Column(
                  children: [
                    // Option 1: Transaction History
                    ListTile(
                      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                      leading: Container(
                        padding: const EdgeInsets.all(8),
                        decoration: BoxDecoration(
                          color: Colors.amber.withValues(alpha: 0.15),
                          shape: BoxShape.circle,
                        ),
                        child: const Icon(
                          Icons.history_rounded,
                          color: Colors.amber,
                          size: 22,
                        ),
                      ),
                      title: Text(
                        'Transaction History',
                        style: GoogleFonts.poppins(
                          color: Colors.white,
                          fontSize: 15,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      trailing: const Icon(
                        Icons.chevron_right_rounded,
                        color: Colors.white70,
                      ),
                      onTap: widget.onTransactionHistoryTap,
                    ),

                    const Padding(
                      padding: EdgeInsets.symmetric(horizontal: 16.0),
                      child: Divider(color: Colors.white12, height: 1),
                    ),

                    // Option 2: Settings
                    ListTile(
                      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                      leading: Container(
                        padding: const EdgeInsets.all(8),
                        decoration: BoxDecoration(
                          color: Colors.purple.withValues(alpha: 0.15),
                          shape: BoxShape.circle,
                        ),
                        child: const Icon(
                          Icons.settings_rounded,
                          color: Colors.purpleAccent,
                          size: 22,
                        ),
                      ),
                      title: Text(
                        'Settings',
                        style: GoogleFonts.poppins(
                          color: Colors.white,
                          fontSize: 15,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      trailing: const Icon(
                        Icons.chevron_right_rounded,
                        color: Colors.white70,
                      ),
                      onTap: widget.onSettingsTap,
                    ),

                    if (widget.onLogoutTap != null) ...[
                      const Padding(
                        padding: EdgeInsets.symmetric(horizontal: 16.0),
                        child: Divider(color: Colors.white12, height: 1),
                      ),

                      // Option 3: Logout
                      ListTile(
                        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                        leading: Container(
                          padding: const EdgeInsets.all(8),
                          decoration: BoxDecoration(
                            color: Colors.red.withValues(alpha: 0.15),
                            shape: BoxShape.circle,
                          ),
                          child: const Icon(
                            Icons.logout_rounded,
                            color: Colors.redAccent,
                            size: 22,
                          ),
                        ),
                        title: Text(
                          'Log Out',
                          style: GoogleFonts.poppins(
                            color: Colors.redAccent,
                            fontSize: 15,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        trailing: const Icon(
                          Icons.chevron_right_rounded,
                          color: Colors.white38,
                        ),
                        onTap: widget.onLogoutTap,
                      ),
                    ],
                  ],
                ),
              ),
            ),

            const SizedBox(height: 20),
          ],
        ),
      ),
    );
  }
}
