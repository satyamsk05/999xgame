import 'dart:async';
import 'dart:ui' as ui;
import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:url_launcher/url_launcher.dart';
import '../core/api/api_client.dart';
import '../core/storage/token_manager.dart';
import '../features/auth/data/auth_api.dart';
import '../services/api_service.dart';

class LoginScreen extends StatefulWidget {
  final ValueChanged<Map<String, dynamic>> onLoginSuccess;

  const LoginScreen({
    super.key,
    required this.onLoginSuccess,
  });

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> with WidgetsBindingObserver {
  int _currentStep = 0; // 0: GetStarted, 1: Phone, 2: Verifying, 3: DOB, 4: Name, 5: Welcome
  bool _isLoading = false;
  bool _isVerifyingActive = false;
  String? _errorMessage;
  String? _statusMessage;
  String? _currentLogginToken;
  String? _currentLogginLink;

  final TextEditingController _phoneController = TextEditingController();
  final TextEditingController _nameController = TextEditingController();
  DateTime _selectedDob = DateTime(DateTime.now().year - 21, DateTime.now().month, DateTime.now().day);

  Map<String, dynamic> _sessionData = {};

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _phoneController.addListener(() {
      if (mounted) {
        setState(() {});
      }
    });
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _phoneController.dispose();
    _nameController.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed && _currentStep == 2 && !_isVerifyingActive && _currentLogginToken != null) {
      _startVerificationLoop();
    }
  }

  Future<void> _handleGetStarted() async {
    setState(() {
      _isLoading = true;
      _errorMessage = null;
      _statusMessage = 'Connecting to WhatsApp verification...';
    });

    try {
      final createRes = await AuthApi.createLogginToken();
      final dataMap = createRes['data'] as Map<String, dynamic>?;
      final logginToken = dataMap?['token']?.toString() ?? createRes['token']?.toString() ?? '';
      final link = dataMap?['link']?.toString() ?? createRes['link']?.toString() ?? '';

      if (logginToken.isEmpty) {
        throw Exception('Failed to generate verification token.');
      }

      _currentLogginToken = logginToken;
      _currentLogginLink = link;

      if (link.isNotEmpty) {
        await _reopenWhatsApp();
      }

      if (mounted) {
        setState(() {
          _currentStep = 2;
          _statusMessage = 'Please wait while we verify your number...';
        });
      }

      _startVerificationLoop();
    } catch (e) {
      if (mounted) {
        setState(() {
          _isLoading = false;
          _statusMessage = null;
          _currentStep = 0;
          _errorMessage = e is ApiException ? e.message : 'Verification failed. Please try again.';
        });
      }
    }
  }

  Future<void> _reopenWhatsApp() async {
    final link = _currentLogginLink;
    if (link == null || link.isEmpty) return;
    final uri = Uri.parse(link);
    bool launched = false;
    try {
      launched = await launchUrl(uri, mode: LaunchMode.externalApplication);
    } catch (_) {}
    if (!launched) {
      await launchUrl(uri, mode: LaunchMode.platformDefault);
    }
  }

  Future<void> _startVerificationLoop() async {
    final token = _currentLogginToken;
    if (token == null || token.isEmpty || _isVerifyingActive) return;

    _isVerifyingActive = true;
    if (mounted) {
      setState(() {
        _isLoading = true;
        _errorMessage = null;
        _statusMessage = 'Please wait while we send the verification message to your number';
      });
    }

    int attempts = 0;
    const maxAttempts = 30;

    while (attempts < maxAttempts && mounted && _currentStep == 2) {
      attempts++;
      try {
        final verifyRes = await AuthApi.verifyLogginToken(token, timeout: const Duration(seconds: 12));
        final appToken = verifyRes['token']?.toString() ?? '';
        final dataMap = verifyRes['data'] as Map<String, dynamic>? ?? verifyRes;
        final user = (dataMap['user'] as Map<String, dynamic>?) ??
            (verifyRes['user'] as Map<String, dynamic>?) ?? {};

        if (appToken.isNotEmpty) {
          _sessionData = verifyRes;

          await TokenManager.saveSession(
            token: appToken,
            userId: user['id']?.toString() ?? '',
            username: user['username']?.toString(),
            phone: user['phone']?.toString(),
            avatarPath: user['avatarPath']?.toString(),
          );

          final isNewUser = dataMap['isNewUser'] == true ||
              verifyRes['isNewUser'] == true ||
              !(user['isOnboardingComplete'] == true);

          final uname = user['username']?.toString() ?? '';
          _nameController.text = (uname.isNotEmpty && uname != 'Player') ? uname : '';

          if (mounted) {
            setState(() {
              _isVerifyingActive = false;
              _isLoading = false;
              _statusMessage = null;
              _currentStep = isNewUser ? 3 : 5;
            });
          }

          if (!isNewUser) _startWelcomeTransition();
          return;
        }
      } catch (e) {
        if (e is ApiException) {
          const retryableStatuses = <int>{0, 408, 429, 500, 502, 503, 504};
          final status = e.statusCode ?? 0;
          if (!retryableStatuses.contains(status)) {
            _isVerifyingActive = false;
            if (mounted) {
              setState(() {
                _isLoading = false;
                _statusMessage = null;
                _errorMessage = e.message;
                _currentStep = 0;
              });
            }
            return;
          }
        }
        debugPrint('[LoginVerify] transient error: $e');
        await Future.delayed(const Duration(milliseconds: 1500));
      }
    }

    _isVerifyingActive = false;
    if (mounted && _currentStep == 2) {
      setState(() {
        _isLoading = false;
        _statusMessage = 'Waiting for message... Tap below if you have already sent it.';
      });
    }
  }

  void _handleAgeNext() {
    final today = DateTime.now();
    final latestAllowed = DateTime(today.year - 18, today.month, today.day);
    final age = today.year - _selectedDob.year -
        ((today.month < _selectedDob.month ||
                (today.month == _selectedDob.month && today.day < _selectedDob.day)) ? 1 : 0);
    if (age < 18) {
      setState(() => _errorMessage = 'You must be at least 18 years old.');
      return;
    }
    if (_selectedDob.isAfter(latestAllowed)) {
      setState(() => _errorMessage = 'Please select a valid date of birth.');
      return;
    }
    setState(() {
      _errorMessage = null;
      _currentStep = 4;
    });
  }

  Future<void> _handleNameNext() async {
    FocusScope.of(context).unfocus();
    final name = _nameController.text.trim();
    if (name.length < 2) {
      setState(() {
        _errorMessage = 'Please enter your name (at least 2 characters).';
      });
      return;
    }

    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      final dobStr = '${_selectedDob.year}-${_selectedDob.month.toString().padLeft(2, '0')}-${_selectedDob.day.toString().padLeft(2, '0')}';
      await ApiService.completeOnboarding(username: name, dateOfBirth: dobStr);
    } catch (e) {
      if (mounted) {
        setState(() {
          _isLoading = false;
          _errorMessage = e is ApiException ? e.message : 'Could not complete setup. Please try again.';
        });
      }
      return;
    }

    if (mounted) {
      setState(() {
        _isLoading = false;
        _currentStep = 5;
      });
    }

    _startWelcomeTransition();
  }

  void _startWelcomeTransition() {
    Timer(const Duration(milliseconds: 1800), () {
      if (mounted) widget.onLoginSuccess(_sessionData);
    });
  }

  Widget _buildWhatsAppIcon({double size = 28, Color color = const Color(0xFF25D366)}) {
    try {
      return SvgPicture.asset(
        'Assets/whatsapp-svgrepo-com.svg',
        width: size,
        height: size,
        colorFilter: color != const Color(0xFF25D366) ? ColorFilter.mode(color, BlendMode.srcIn) : null,
      );
    } catch (_) {
      return Icon(Icons.chat_bubble_rounded, color: color, size: size);
    }
  }

  Widget _buildStepIndicator(int activeIndex, int totalSteps) {
    return Row(
      children: List.generate(totalSteps, (index) {
        final isActive = index <= activeIndex;
        return Expanded(
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 300),
            height: 4,
            margin: const EdgeInsets.symmetric(horizontal: 3),
            decoration: BoxDecoration(
              color: isActive ? const Color(0xFF9A67BD) : Colors.white.withValues(alpha: 0.2),
              borderRadius: BorderRadius.circular(2),
              boxShadow: isActive
                  ? [BoxShadow(color: const Color(0xFF9A67BD).withValues(alpha: 0.6), blurRadius: 6, spreadRadius: 1)]
                  : [],
            ),
          ),
        );
      }),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_currentStep == 5) return _buildWelcomeScreen();

    return Scaffold(
      backgroundColor: const Color(0xFF0C011A),
      body: Stack(
        children: [
          const Positioned.fill(child: _PurpleWaveBackground()),
          SafeArea(
            child: Column(
              children: [
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 20.0, vertical: 8.0),
                  child: Column(
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          if (_currentStep > 0)
                            IconButton(
                              icon: const Icon(Icons.arrow_back_ios_new_rounded, color: Colors.white, size: 20),
                              onPressed: () {
                                setState(() {
                                  _currentStep = 0;
                                  _isVerifyingActive = false;
                                  _isLoading = false;
                                });
                              },
                            )
                          else
                            const SizedBox(width: 40),
                          const SizedBox(width: 40),
                        ],
                      ),
                      if (_currentStep > 0) ...[
                        const SizedBox(height: 8),
                        Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 16.0),
                          child: _buildStepIndicator(_currentStep - 2, 2),
                        ),
                      ],
                    ],
                  ),
                ),
                Expanded(
                  child: AnimatedSwitcher(
                    duration: const Duration(milliseconds: 400),
                    switchInCurve: Curves.easeOutCubic,
                    switchOutCurve: Curves.easeInCubic,
                    transitionBuilder: (Widget child, Animation<double> animation) {
                      return FadeTransition(
                        opacity: animation,
                        child: SlideTransition(
                          position: Tween<Offset>(begin: const Offset(0.04, 0), end: Offset.zero).animate(animation),
                          child: child,
                        ),
                      );
                    },
                    child: _buildCurrentStepView(),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildCurrentStepView() {
    switch (_currentStep) {
      case 0:
        return _buildGetStartedScreen();
      case 1:
        return _buildPhoneScreen();
      case 2:
        return _buildVerifyingScreen();
      case 3:
        return _buildAgeScreen();
      case 4:
        return _buildNameScreen();
      default:
        return _buildGetStartedScreen();
    }
  }

  Widget _buildGetStartedScreen() {
    return _SmoothTextFadeSlide(
      key: const ValueKey(0),
      child: Column(
        children: [
          const Spacer(),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 28.0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Play', style: GoogleFonts.poppins(color: Colors.white, fontSize: 42, fontWeight: FontWeight.w900, height: 1.1, letterSpacing: -0.5)),
                Text('Instantly', style: GoogleFonts.poppins(color: const Color(0xFF9A67BD), fontSize: 42, fontWeight: FontWeight.w900, height: 1.1, letterSpacing: -0.5)),
                Text('Win Bigger', style: GoogleFonts.poppins(color: Colors.white, fontSize: 42, fontWeight: FontWeight.w900, height: 1.1, letterSpacing: -0.5)),
                const SizedBox(height: 10),
                Text('Fast. Secure. More Fun.', style: GoogleFonts.poppins(color: Colors.white.withValues(alpha: 0.65), fontSize: 15, fontWeight: FontWeight.w400, letterSpacing: 0.2)),
                const SizedBox(height: 32),
                GestureDetector(
                  onTap: _isLoading ? null : _handleGetStarted,
                  child: Container(
                    height: 53,
                    decoration: BoxDecoration(color: _isLoading ? Colors.black.withValues(alpha: 0.5) : Colors.black, borderRadius: BorderRadius.circular(26.5), boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.4), blurRadius: 15, spreadRadius: 1)]),
                    padding: const EdgeInsets.symmetric(horizontal: 24),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const SizedBox(width: 24),
                        if (_isLoading)
                          const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                        else
                          Text('Continue with WhatsApp', style: GoogleFonts.poppins(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w700)),
                        _buildWhatsAppIcon(size: 22, color: Colors.white),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Container(width: 24, height: 8, decoration: BoxDecoration(color: const Color(0xFF9A67BD), borderRadius: BorderRadius.circular(4))),
              const SizedBox(width: 8),
              Container(width: 8, height: 8, decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.25), shape: BoxShape.circle)),
              const SizedBox(width: 8),
              Container(width: 8, height: 8, decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.25), shape: BoxShape.circle)),
            ],
          ),
          const SizedBox(height: 32),
        ],
      ),
    );
  }

  Widget _buildPhoneScreen() {
    final phoneDigits = _phoneController.text.replaceAll(RegExp(r'\D'), '');
    final isValidPhone = phoneDigits.length == 10;

    return _SmoothTextFadeSlide(
      key: const ValueKey(1),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SizedBox(height: 24),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 24.0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Enter your mobile number', style: GoogleFonts.poppins(color: Colors.white, fontSize: 22, fontWeight: FontWeight.w700, letterSpacing: -0.3)),
                const SizedBox(height: 28),
                Container(
                  decoration: BoxDecoration(color: const Color(0xFF260D4D).withValues(alpha: 0.6), borderRadius: BorderRadius.circular(18), border: Border.all(color: const Color(0xFF6B21A8).withValues(alpha: 0.7), width: 1.5)),
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
                  child: Row(
                    children: [
                      const Text('🇮🇳', style: TextStyle(fontSize: 22)),
                      const SizedBox(width: 8),
                      Text('+91', style: GoogleFonts.poppins(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w600)),
                      const SizedBox(width: 4),
                      Icon(Icons.keyboard_arrow_down_rounded, color: Colors.white.withValues(alpha: 0.7), size: 20),
                      const SizedBox(width: 12),
                      Container(width: 1, height: 26, color: Colors.white.withValues(alpha: 0.2)),
                      const SizedBox(width: 14),
                      Expanded(
                        child: TextField(
                          controller: _phoneController,
                          keyboardType: TextInputType.number,
                          maxLength: 10,
                          inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(10)],
                          style: GoogleFonts.poppins(color: Colors.white, fontSize: 17, fontWeight: FontWeight.w600, letterSpacing: 1.2),
                          decoration: InputDecoration(counterText: '', hintText: '98765 43210', hintStyle: GoogleFonts.poppins(color: Colors.white.withValues(alpha: 0.35), fontSize: 17, fontWeight: FontWeight.w400), border: InputBorder.none),
                        ),
                      ),
                    ],
                  ),
                ),
                if (_errorMessage != null)
                  Padding(padding: const EdgeInsets.only(top: 12.0), child: Text(_errorMessage!, style: GoogleFonts.poppins(color: const Color(0xFFFF5252), fontSize: 13))),
              ],
            ),
          ),
          const Spacer(),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 28.0),
            child: GestureDetector(
              onTap: _isLoading ? null : _handleGetStarted,
              child: AnimatedOpacity(
                duration: const Duration(milliseconds: 200),
                opacity: isValidPhone ? 1.0 : 0.5,
                child: Container(
                  height: 53,
                  decoration: BoxDecoration(color: Colors.black, borderRadius: BorderRadius.circular(26.5), boxShadow: isValidPhone ? [BoxShadow(color: Colors.black.withValues(alpha: 0.4), blurRadius: 18, spreadRadius: 1)] : []),
                  padding: const EdgeInsets.symmetric(horizontal: 24),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      if (_isLoading) ...[
                        const Spacer(),
                        const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2.5)),
                        const Spacer(),
                      ] else ...[
                        const SizedBox(width: 24),
                        Text('Next', style: GoogleFonts.poppins(color: isValidPhone ? Colors.white : Colors.white.withValues(alpha: 0.6), fontSize: 16, fontWeight: FontWeight.w700)),
                        Icon(Icons.arrow_forward_rounded, color: isValidPhone ? Colors.white : Colors.white.withValues(alpha: 0.6), size: 22),
                      ],
                    ],
                  ),
                ),
              ),
            ),
          ),
          const SizedBox(height: 60),
        ],
      ),
    );
  }

  Widget _buildVerifyingScreen() {
    return _SmoothTextFadeSlide(
      key: const ValueKey(2),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Spacer(),
          const Center(child: _WhatsAppRippleAnimation()),
          const SizedBox(height: 36),
          Text('Verifying WhatsApp...', style: GoogleFonts.poppins(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w800, letterSpacing: -0.3)),
          const SizedBox(height: 10),
          Padding(padding: const EdgeInsets.symmetric(horizontal: 40.0), child: Text(_statusMessage ?? 'Please wait while we send the verification message to your number', textAlign: TextAlign.center, style: GoogleFonts.poppins(color: Colors.white.withValues(alpha: 0.65), fontSize: 14, height: 1.45))),
          const SizedBox(height: 30),
          SizedBox(
            width: 38,
            height: 38,
            child: ShaderMask(
              shaderCallback: (Rect bounds) => const LinearGradient(colors: [Color(0xFF9A67BD), Color(0xFF4A0080)]).createShader(bounds),
              child: const CircularProgressIndicator(strokeWidth: 3.5, valueColor: AlwaysStoppedAnimation<Color>(Colors.white)),
            ),
          ),
          const Spacer(),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 24.0, vertical: 20.0),
            child: Column(
              children: [
                GestureDetector(
                  onTap: _isLoading ? null : () => _startVerificationLoop(),
                  child: Container(height: 51, decoration: BoxDecoration(color: Colors.black, borderRadius: BorderRadius.circular(25.5), boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.3), blurRadius: 12)]), child: Center(child: Text("I've Sent the Message", style: GoogleFonts.poppins(color: Colors.white, fontSize: 15.5, fontWeight: FontWeight.w700)))),
                const SizedBox(height: 12),
                GestureDetector(
                  onTap: _reopenWhatsApp,
                  child: Container(height: 47.5, decoration: BoxDecoration(color: Colors.transparent, borderRadius: BorderRadius.circular(23.75), border: Border.all(color: const Color(0xFF9A67BD), width: 1.5)), child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [_buildWhatsAppIcon(size: 20, color: const Color(0xFF9A67BD)), const SizedBox(width: 8), Text('Re-open WhatsApp', style: GoogleFonts.poppins(color: const Color(0xFF9A67BD), fontSize: 14.5, fontWeight: FontWeight.w600))])),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildAgeScreen() {
    final today = DateTime.now();
    final minimumDate = DateTime(today.year - 100, today.month, today.day);
    final maximumDate = DateTime(today.year - 18, today.month, today.day);

    return _SmoothTextFadeSlide(
      key: const ValueKey(3),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SizedBox(height: 24),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 24.0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Enter your date of birth', style: GoogleFonts.poppins(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w800)),
                const SizedBox(height: 6),
                Text("Your date of birth is required for age verification", style: GoogleFonts.poppins(color: Colors.white.withValues(alpha: 0.6), fontSize: 13.5)),
              ],
            ),
          ),
          const SizedBox(height: 20),
          SizedBox(
            height: 220,
            child: CupertinoDatePicker(
              mode: CupertinoDatePickerMode.date,
              minimumDate: minimumDate,
              maximumDate: maximumDate,
              initialDateTime: _selectedDob.isBefore(minimumDate) || _selectedDob.isAfter(maximumDate) ? maximumDate : _selectedDob,
              onDateTimeChanged: (value) {
                setState(() {
                  _selectedDob = DateTime(value.year, value.month, value.day);
                  _errorMessage = null;
                });
              },
            ),
          ),
          if (_errorMessage != null)
            Padding(padding: const EdgeInsets.symmetric(horizontal: 24.0), child: Text(_errorMessage!, style: GoogleFonts.poppins(color: const Color(0xFFFF5252), fontSize: 13))),
          const Spacer(),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 28.0),
            child: GestureDetector(
              onTap: _handleAgeNext,
              child: Container(height: 53, decoration: BoxDecoration(color: Colors.black, borderRadius: BorderRadius.circular(26.5), boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.4), blurRadius: 18, spreadRadius: 1)]), padding: const EdgeInsets.symmetric(horizontal: 24), child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [const SizedBox(width: 24), Text('Next', style: GoogleFonts.poppins(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w700)), const Icon(Icons.arrow_forward_rounded, color: Colors.white, size: 22)])),
            ),
          ),
          const SizedBox(height: 60),
        ],
      ),
    );
  }

  Widget _buildNameScreen() {
    return _SmoothTextFadeSlide(
      key: const ValueKey(4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SizedBox(height: 24),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 24.0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Enter your name', style: GoogleFonts.poppins(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w800)),
                const SizedBox(height: 6),
                Text('This is how you will appear to others', style: GoogleFonts.poppins(color: Colors.white.withValues(alpha: 0.6), fontSize: 13.5)),
                const SizedBox(height: 32),
                Container(
                  decoration: BoxDecoration(color: const Color(0xFF260D4D).withValues(alpha: 0.6), borderRadius: BorderRadius.circular(18), border: Border.all(color: const Color(0xFF6B21A8).withValues(alpha: 0.7), width: 1.5)),
                  padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 4),
                  child: TextField(
                    controller: _nameController,
                    autofocus: true,
                    style: GoogleFonts.poppins(color: Colors.white, fontSize: 17, fontWeight: FontWeight.w600),
                    decoration: InputDecoration(hintText: 'Alex', hintStyle: GoogleFonts.poppins(color: Colors.white.withValues(alpha: 0.3)), border: InputBorder.none),
                  ),
                ),
              ],
            ),
          ),
          const Spacer(),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 28.0),
            child: GestureDetector(
              onTap: _isLoading ? null : _handleNameNext,
              child: Container(height: 53, decoration: BoxDecoration(color: Colors.black, borderRadius: BorderRadius.circular(26.5), boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.4), blurRadius: 18, spreadRadius: 1)]), padding: const EdgeInsets.symmetric(horizontal: 24), child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [const SizedBox(width: 24), if (_isLoading) const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)) else Text('Continue', style: GoogleFonts.poppins(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w700)), if (!_isLoading) const Icon(Icons.arrow_forward_rounded, color: Colors.white, size: 22)])),
            ),
          ),
          const SizedBox(height: 60),
        ],
      ),
    );
  }

  // Existing welcome/background/animation widgets remain below unchanged.
