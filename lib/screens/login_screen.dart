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
  int _currentStep = 0; // 0: GetStarted, 1: Phone, 2: Verifying, 3: Age, 4: Name, 5: Welcome
  bool _isLoading = false;
  bool _isVerifyingActive = false;
  String? _errorMessage;
  String? _statusMessage;
  String? _currentLogginToken;
  String? _currentLogginLink;

  final TextEditingController _phoneController = TextEditingController();
  final TextEditingController _nameController = TextEditingController();
  int _selectedAge = 21;

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
          _currentStep = 2; // Move to Auto Verification Screen
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
        // verifyRes is the full JSON body — user is nested under data.user
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

          // Check if this is a returning user who already completed onboarding
          final isNewUser = dataMap['isNewUser'] == true ||
              verifyRes['isNewUser'] == true ||
              !(user['isOnboardingComplete'] == true);

          final uname = user['username']?.toString() ?? '';
          if (uname.isNotEmpty && uname != 'Player') {
            _nameController.text = uname;
          } else {
            _nameController.text = '';
          }

          if (mounted) {
            setState(() {
              _isVerifyingActive = false;
              _isLoading = false;
              _statusMessage = null;
              // New user → show onboarding; returning user → skip to Welcome
              _currentStep = isNewUser ? 3 : 5;
            });
          }

          // Returning user: immediately trigger onLoginSuccess after brief welcome
          if (!isNewUser) {
            _startWelcomeTransition();
          }
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
    setState(() {
      _currentStep = 4; // Move to Enter Name Screen
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
      // Calculate date of birth from selected age
      final dob = DateTime(DateTime.now().year - _selectedAge, 1, 1);
      final dobStr = '${dob.year}-${dob.month.toString().padLeft(2, '0')}-01';

      // Complete onboarding: save name + DOB, mark user as onboarded
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
        _currentStep = 5; // Move to Welcome Screen
      });
    }

    _startWelcomeTransition();
  }

  void _startWelcomeTransition() {
    Timer(const Duration(milliseconds: 1800), () {
      if (mounted) {
        widget.onLoginSuccess(_sessionData);
      }
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
      return Icon(
        Icons.chat_bubble_rounded,
        color: color,
        size: size,
      );
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
                  ? [
                      BoxShadow(
                        color: const Color(0xFF9A67BD).withValues(alpha: 0.6),
                        blurRadius: 6,
                        spreadRadius: 1,
                      )
                    ]
                  : [],
            ),
          ),
        );
      }),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_currentStep == 5) {
      return _buildWelcomeScreen();
    }

    return Scaffold(
      backgroundColor: const Color(0xFF0C011A),
      body: Stack(
        children: [
          // Background Gradient with Smooth Curved Wave Shapes
          const Positioned.fill(
            child: _PurpleWaveBackground(),
          ),

          SafeArea(
            child: Column(
              children: [
                // Top Navigation Bar
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
                                  // From verifying, go back to GetStarted (step 0) since phone screen is removed
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
                          // Only 2 real steps shown: Verifying(0), Age(1), Name(2)
                          child: _buildStepIndicator(_currentStep - 2, 2),
                        ),
                      ],
                    ],
                  ),
                ),

                // Main Content View with Smooth Custom Animated Switcher
                Expanded(
                  child: AnimatedSwitcher(
                    duration: const Duration(milliseconds: 400),
                    switchInCurve: Curves.easeOutCubic,
                    switchOutCurve: Curves.easeInCubic,
                    transitionBuilder: (Widget child, Animation<double> animation) {
                      return FadeTransition(
                        opacity: animation,
                        child: SlideTransition(
                          position: Tween<Offset>(
                            begin: const Offset(0.04, 0),
                            end: Offset.zero,
                          ).animate(animation),
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

  // --- STEP 0: Get Started Screen (Exact Screenshot Match) ---
  Widget _buildGetStartedScreen() {
    return _SmoothTextFadeSlide(
      key: const ValueKey(0),
      child: Column(
        children: [
          const Spacer(),

          // Bottom Left Bold Content Area
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 28.0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Play',
                  style: GoogleFonts.poppins(
                    color: Colors.white,
                    fontSize: 42,
                    fontWeight: FontWeight.w900,
                    height: 1.1,
                    letterSpacing: -0.5,
                  ),
                ),
                Text(
                  'Instantly',
                  style: GoogleFonts.poppins(
                    color: const Color(0xFF9A67BD),
                    fontSize: 42,
                    fontWeight: FontWeight.w900,
                    height: 1.1,
                    letterSpacing: -0.5,
                  ),
                ),
                Text(
                  'Win Bigger',
                  style: GoogleFonts.poppins(
                    color: Colors.white,
                    fontSize: 42,
                    fontWeight: FontWeight.w900,
                    height: 1.1,
                    letterSpacing: -0.5,
                  ),
                ),
                const SizedBox(height: 10),
                Text(
                  'Fast. Secure. More Fun.',
                  style: GoogleFonts.poppins(
                    color: Colors.white.withValues(alpha: 0.65),
                    fontSize: 15,
                    fontWeight: FontWeight.w400,
                    letterSpacing: 0.2,
                  ),
                ),
                const SizedBox(height: 32),

                // Full Width White Capsule Button
                GestureDetector(
                  onTap: _isLoading ? null : _handleGetStarted,
                  child: Container(
                    height: 53,
                    decoration: BoxDecoration(
                      color: _isLoading ? Colors.black.withValues(alpha: 0.5) : Colors.black,
                      borderRadius: BorderRadius.circular(26.5),
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black.withValues(alpha: 0.4),
                          blurRadius: 15,
                          spreadRadius: 1,
                        ),
                      ],
                    ),
                    padding: const EdgeInsets.symmetric(horizontal: 24),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const SizedBox(width: 24),
                        if (_isLoading)
                          const SizedBox(
                            width: 22, height: 22,
                            child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                          )
                        else
                          Text(
                            'Continue with WhatsApp',
                            style: GoogleFonts.poppins(
                              color: Colors.white,
                              fontSize: 16,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        _buildWhatsAppIcon(size: 22, color: Colors.white),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),

          const SizedBox(height: 20),

          // Bottom Page Indicator Dots
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Container(
                width: 24,
                height: 8,
                decoration: BoxDecoration(
                  color: const Color(0xFF9A67BD),
                  borderRadius: BorderRadius.circular(4),
                ),
              ),
              const SizedBox(width: 8),
              Container(
                width: 8,
                height: 8,
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.25),
                  shape: BoxShape.circle,
                ),
              ),
              const SizedBox(width: 8),
              Container(
                width: 8,
                height: 8,
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.25),
                  shape: BoxShape.circle,
                ),
              ),
            ],
          ),

          const SizedBox(height: 32),
        ],
      ),
    );
  }

  // --- STEP 1: Enter Phone Number Screen ---
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
                Text(
                  'Enter your mobile number',
                  style: GoogleFonts.poppins(
                    color: Colors.white,
                    fontSize: 22,
                    fontWeight: FontWeight.w700,
                    letterSpacing: -0.3,
                  ),
                ),
                const SizedBox(height: 28),

                // Translucent Purple Input Container (Exact Screenshot Match)
                Container(
                  decoration: BoxDecoration(
                    color: const Color(0xFF260D4D).withValues(alpha: 0.6),
                    borderRadius: BorderRadius.circular(18),
                    border: Border.all(color: const Color(0xFF6B21A8).withValues(alpha: 0.7), width: 1.5),
                  ),
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
                  child: Row(
                    children: [
                      const Text(
                        '🇮🇳',
                        style: TextStyle(fontSize: 22),
                      ),
                      const SizedBox(width: 8),
                      Text(
                        '+91',
                        style: GoogleFonts.poppins(
                          color: Colors.white,
                          fontSize: 16,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
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
                          inputFormatters: [
                            FilteringTextInputFormatter.digitsOnly,
                            LengthLimitingTextInputFormatter(10),
                          ],
                          style: GoogleFonts.poppins(
                            color: Colors.white,
                            fontSize: 17,
                            fontWeight: FontWeight.w600,
                            letterSpacing: 1.2,
                          ),
                          decoration: InputDecoration(
                            counterText: '',
                            hintText: '98765 43210',
                            hintStyle: GoogleFonts.poppins(
                              color: Colors.white.withValues(alpha: 0.35),
                              fontSize: 17,
                              fontWeight: FontWeight.w400,
                            ),
                            border: InputBorder.none,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),

                if (_errorMessage != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 12.0),
                    child: Text(
                      _errorMessage!,
                      style: GoogleFonts.poppins(
                        color: const Color(0xFFFF5252),
                        fontSize: 13,
                      ),
                    ),
                  ),
              ],
            ),
          ),

          const Spacer(),

          // Bottom Vibrant Purple Gradient Next Button (Position-matched to Get Started)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 28.0),
            child: GestureDetector(
              onTap: _isLoading ? null : _handleGetStarted,
              child: AnimatedOpacity(
                duration: const Duration(milliseconds: 200),
                opacity: isValidPhone ? 1.0 : 0.5,
                child: Container(
                  height: 53,
                  decoration: BoxDecoration(
                    color: Colors.black,
                    borderRadius: BorderRadius.circular(26.5),
                    boxShadow: isValidPhone
                        ? [
                            BoxShadow(
                              color: Colors.black.withValues(alpha: 0.4),
                              blurRadius: 18,
                              spreadRadius: 1,
                            ),
                          ]
                        : [],
                  ),
                  padding: const EdgeInsets.symmetric(horizontal: 24),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      if (_isLoading) ...[
                        const Spacer(),
                        const SizedBox(
                          width: 22,
                          height: 22,
                          child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2.5),
                        ),
                        const Spacer(),
                      ] else ...[
                        const SizedBox(width: 24),
                        Text(
                          'Next',
                          style: GoogleFonts.poppins(
                            color: isValidPhone ? Colors.white : Colors.white.withValues(alpha: 0.6),
                            fontSize: 16,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        Icon(
                          Icons.arrow_forward_rounded,
                          color: isValidPhone ? Colors.white : Colors.white.withValues(alpha: 0.6),
                          size: 22,
                        ),
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

  // --- STEP 2: WhatsApp Verification Screen (Exact Ripple Animation) ---
  Widget _buildVerifyingScreen() {
    return _SmoothTextFadeSlide(
      key: const ValueKey(2),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Spacer(),

          // Pulsing Concentric WhatsApp Ripple Animation
          const Center(
            child: _WhatsAppRippleAnimation(),
          ),

          const SizedBox(height: 36),

          Text(
            'Verifying WhatsApp...',
            style: GoogleFonts.poppins(
              color: Colors.white,
              fontSize: 24,
              fontWeight: FontWeight.w800,
              letterSpacing: -0.3,
            ),
          ),

          const SizedBox(height: 10),

          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 40.0),
            child: Text(
              _statusMessage ?? 'Please wait while we send the verification message to your number',
              textAlign: TextAlign.center,
              style: GoogleFonts.poppins(
                color: Colors.white.withValues(alpha: 0.65),
                fontSize: 14,
                height: 1.45,
              ),
            ),
          ),

          const SizedBox(height: 30),

          // Custom Glowing Purple Circular Spinner
          SizedBox(
            width: 38,
            height: 38,
            child: ShaderMask(
              shaderCallback: (Rect bounds) {
                return const LinearGradient(
                  colors: [Color(0xFF9A67BD), Color(0xFF4A0080)],
                ).createShader(bounds);
              },
              child: const CircularProgressIndicator(
                strokeWidth: 3.5,
                valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
              ),
            ),
          ),

          const Spacer(),

          // Bottom Action Buttons
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 24.0, vertical: 20.0),
            child: Column(
              children: [
                GestureDetector(
                  onTap: _isLoading ? null : () => _startVerificationLoop(),
                  child: Container(
                    height: 51,
                    decoration: BoxDecoration(
                      color: Colors.black,
                      borderRadius: BorderRadius.circular(25.5),
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black.withValues(alpha: 0.3),
                          blurRadius: 12,
                        ),
                      ],
                    ),
                    child: Center(
                      child: Text(
                        "I've Sent the Message",
                        style: GoogleFonts.poppins(
                          color: Colors.white,
                          fontSize: 15.5,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 12),
                GestureDetector(
                  onTap: _reopenWhatsApp,
                  child: Container(
                    height: 47.5,
                    decoration: BoxDecoration(
                      color: Colors.transparent,
                      borderRadius: BorderRadius.circular(23.75),
                      border: Border.all(color: const Color(0xFF9A67BD), width: 1.5),
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        _buildWhatsAppIcon(size: 20, color: const Color(0xFF9A67BD)),
                        const SizedBox(width: 8),
                        Text(
                          'Re-open WhatsApp',
                          style: GoogleFonts.poppins(
                            color: const Color(0xFF9A67BD),
                            fontSize: 14.5,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  // --- STEP 3: Enter Age Screen ---
  Widget _buildAgeScreen() {
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
                Text(
                  'Enter your age',
                  style: GoogleFonts.poppins(
                    color: Colors.white,
                    fontSize: 24,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  "We'll use this to personalize your experience",
                  style: GoogleFonts.poppins(
                    color: Colors.white.withValues(alpha: 0.6),
                    fontSize: 13.5,
                  ),
                ),
              ],
            ),
          ),

          const SizedBox(height: 30),

          SizedBox(
            height: 200,
            child: CupertinoPicker(
              itemExtent: 44,
              scrollController: FixedExtentScrollController(initialItem: 3),
              onSelectedItemChanged: (index) {
                setState(() {
                  _selectedAge = 18 + index;
                });
              },
              children: List.generate(80, (index) {
                final age = 18 + index;
                final isSelected = age == _selectedAge;
                return Center(
                  child: Text(
                    '$age',
                    style: GoogleFonts.poppins(
                      color: isSelected ? Colors.white : Colors.white.withValues(alpha: 0.3),
                      fontSize: isSelected ? 24 : 17,
                      fontWeight: isSelected ? FontWeight.w700 : FontWeight.w400,
                    ),
                  ),
                );
              }),
            ),
          ),

          const Spacer(),

          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 28.0),
            child: GestureDetector(
              onTap: _handleAgeNext,
              child: Container(
                height: 53,
                decoration: BoxDecoration(
                  color: Colors.black,
                  borderRadius: BorderRadius.circular(26.5),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withValues(alpha: 0.4),
                      blurRadius: 18,
                      spreadRadius: 1,
                    ),
                  ],
                ),
                padding: const EdgeInsets.symmetric(horizontal: 24),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const SizedBox(width: 24),
                    Text(
                      'Next',
                      style: GoogleFonts.poppins(
                        color: Colors.white,
                        fontSize: 16,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const Icon(Icons.arrow_forward_rounded, color: Colors.white, size: 22),
                  ],
                ),
              ),
            ),
          ),

          const SizedBox(height: 60),
        ],
      ),
    );
  }

  // --- STEP 4: Enter Name Screen ---
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
                Text(
                  'Enter your name',
                  style: GoogleFonts.poppins(
                    color: Colors.white,
                    fontSize: 24,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  'This is how you will appear to others',
                  style: GoogleFonts.poppins(
                    color: Colors.white.withValues(alpha: 0.6),
                    fontSize: 13.5,
                  ),
                ),
                const SizedBox(height: 32),

                Container(
                  decoration: BoxDecoration(
                    color: const Color(0xFF260D4D).withValues(alpha: 0.6),
                    borderRadius: BorderRadius.circular(18),
                    border: Border.all(color: const Color(0xFF6B21A8).withValues(alpha: 0.7), width: 1.5),
                  ),
                  padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 4),
                  child: TextField(
                    controller: _nameController,
                    autofocus: true,
                    style: GoogleFonts.poppins(
                      color: Colors.white,
                      fontSize: 17,
                      fontWeight: FontWeight.w600,
                    ),
                    decoration: InputDecoration(
                      hintText: 'Alex',
                      hintStyle: GoogleFonts.poppins(color: Colors.white.withValues(alpha: 0.3)),
                      border: InputBorder.none,
                    ),
                  ),
                ),
              ],
            ),
          ),

          const Spacer(),

          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 28.0),
            child: GestureDetector(
              onTap: _handleNameNext,
              child: Container(
                height: 53,
                decoration: BoxDecoration(
                  color: Colors.black,
                  borderRadius: BorderRadius.circular(26.5),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withValues(alpha: 0.4),
                      blurRadius: 18,
                      spreadRadius: 1,
                    ),
                  ],
                ),
                padding: const EdgeInsets.symmetric(horizontal: 24),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const SizedBox(width: 24),
                    Text(
                      'Next',
                      style: GoogleFonts.poppins(
                        color: Colors.white,
                        fontSize: 16,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const Icon(Icons.arrow_forward_rounded, color: Colors.white, size: 22),
                  ],
                ),
              ),
            ),
          ),

          const SizedBox(height: 60),
        ],
      ),
    );
  }

  // --- STEP 5: Welcome Screen (Exact Screenshot Match) ---
  Widget _buildWelcomeScreen() {
    final displayName = _nameController.text.trim().isNotEmpty ? _nameController.text.trim() : 'Guest_a6-c';

    return Scaffold(
      backgroundColor: const Color(0xFF0C011A),
      body: Stack(
        children: [
          const Positioned.fill(
            child: _PurpleWaveBackground(),
          ),
          SafeArea(
            child: _SmoothTextFadeSlide(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 32.0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const SizedBox(height: 60),
                    Text(
                      'Welcome,',
                      style: GoogleFonts.poppins(
                        color: Colors.white,
                        fontSize: 44,
                        fontWeight: FontWeight.w900,
                        height: 1.1,
                        letterSpacing: -1.0,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      displayName,
                      style: GoogleFonts.poppins(
                        color: Colors.white.withValues(alpha: 0.65),
                        fontSize: 22,
                        fontWeight: FontWeight.w500,
                        letterSpacing: -0.3,
                      ),
                    ),
                    const Spacer(),
                    Center(
                      child: Container(
                        width: 36,
                        height: 36,
                        padding: const EdgeInsets.all(4),
                        child: const CircularProgressIndicator(
                          color: Color(0xFF9A67BD),
                          strokeWidth: 3.5,
                        ),
                      ),
                    ),
                    const SizedBox(height: 60),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ==========================================
// CUSTOM UI & ANIMATION COMPONENTS
// ==========================================

/// Custom Organic Purple Curved Wave Background
class _PurpleWaveBackground extends StatelessWidget {
  const _PurpleWaveBackground();

  @override
  Widget build(BuildContext context) {
    return Stack(
      fit: StackFit.expand,
      children: [
        // Base painted waves
        CustomPaint(
          painter: _WaveBackgroundPainter(),
        ),
        // Blur overlay — softens the wave shapes into a dreamy frosted look
        BackdropFilter(
          filter: ui.ImageFilter.blur(sigmaX: 18, sigmaY: 18),
          child: Container(
            color: Colors.transparent,
          ),
        ),
        // Subtle dark overlay after blur to restore depth & contrast
        Container(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [
                const Color(0xFF0C011A).withValues(alpha: 0.25),
                const Color(0xFF0C011A).withValues(alpha: 0.45),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _WaveBackgroundPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    // Base dark purple canvas paint using sample palette
    final rect = Offset.zero & size;
    final bgGradient = RadialGradient(
      center: const Alignment(0.4, -0.6),
      radius: 1.3,
      colors: const [
        Color(0xFF4A0080),
        Color(0xFF260046),
        Color(0xFF0C011A),
      ],
      stops: const [0.0, 0.5, 1.0],
    );

    canvas.drawRect(rect, Paint()..shader = bgGradient.createShader(rect));

    // Top Right Glowing Organic Wave Curve
    final topRightPath = Path();
    topRightPath.moveTo(size.width * 0.45, 0);
    topRightPath.quadraticBezierTo(
      size.width * 0.5,
      size.height * 0.18,
      size.width,
      size.height * 0.22,
    );
    topRightPath.lineTo(size.width, 0);
    topRightPath.close();

    final topRightGradient = LinearGradient(
      begin: Alignment.topRight,
      end: Alignment.bottomLeft,
      colors: [
        const Color(0xFF9A67BD).withValues(alpha: 0.45),
        const Color(0xFF4A0080).withValues(alpha: 0.1),
      ],
    );

    canvas.drawPath(
      topRightPath,
      Paint()..shader = topRightGradient.createShader(rect),
    );

    // Bottom Curved Organic Wave
    final bottomPath = Path();
    bottomPath.moveTo(0, size.height * 0.52);
    bottomPath.cubicTo(
      size.width * 0.35,
      size.height * 0.45,
      size.width * 0.65,
      size.height * 0.68,
      size.width,
      size.height * 0.66,
    );
    bottomPath.lineTo(size.width, size.height);
    bottomPath.lineTo(0, size.height);
    bottomPath.close();

    final bottomGradient = LinearGradient(
      begin: Alignment.topCenter,
      end: Alignment.bottomCenter,
      colors: [
        const Color(0xFF4A0080).withValues(alpha: 0.5),
        const Color(0xFF0C011A).withValues(alpha: 0.85),
      ],
    );

    canvas.drawPath(
      bottomPath,
      Paint()..shader = bottomGradient.createShader(rect),
    );

    // Secondary Smooth Ambient Wave Layer at Bottom Right
    final secBottomPath = Path();
    secBottomPath.moveTo(0, size.height * 0.75);
    secBottomPath.quadraticBezierTo(
      size.width * 0.5,
      size.height * 0.62,
      size.width,
      size.height * 0.88,
    );
    secBottomPath.lineTo(size.width, size.height);
    secBottomPath.lineTo(0, size.height);
    secBottomPath.close();

    final secBottomGradient = LinearGradient(
      begin: Alignment.bottomLeft,
      end: Alignment.topRight,
      colors: [
        const Color(0xFF4A0080).withValues(alpha: 0.6),
        const Color(0xFF9A67BD).withValues(alpha: 0.2),
      ],
    );

    canvas.drawPath(
      secBottomPath,
      Paint()..shader = secBottomGradient.createShader(rect),
    );
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

/// Smooth Staggered Slide & Fade Animation Wrapper for Text/Elements
class _SmoothTextFadeSlide extends StatefulWidget {
  final Widget child;

  const _SmoothTextFadeSlide({
    super.key,
    required this.child,
  });

  @override
  State<_SmoothTextFadeSlide> createState() => _SmoothTextFadeSlideState();
}

class _SmoothTextFadeSlideState extends State<_SmoothTextFadeSlide> with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _fadeAnimation;
  late Animation<Offset> _slideAnimation;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 550),
    );

    _fadeAnimation = CurvedAnimation(
      parent: _controller,
      curve: Curves.easeOut,
    );

    _slideAnimation = Tween<Offset>(
      begin: const Offset(0, 0.06),
      end: Offset.zero,
    ).animate(CurvedAnimation(
      parent: _controller,
      curve: Curves.easeOutCubic,
    ));

    _controller.forward();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FadeTransition(
      opacity: _fadeAnimation,
      child: SlideTransition(
        position: _slideAnimation,
        child: widget.child,
      ),
    );
  }
}

/// Pulsing WhatsApp Verification Concentric Ripple Animation
class _WhatsAppRippleAnimation extends StatefulWidget {
  const _WhatsAppRippleAnimation();

  @override
  State<_WhatsAppRippleAnimation> createState() => _WhatsAppRippleAnimationState();
}

class _WhatsAppRippleAnimationState extends State<_WhatsAppRippleAnimation> with SingleTickerProviderStateMixin {
  late AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 2200),
    )..repeat();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _controller,
      builder: (context, child) {
        return SizedBox(
          width: 220,
          height: 220,
          child: Stack(
            alignment: Alignment.center,
            children: [
              // Concentric Expanding Rings
              ...List.generate(3, (index) {
                final progress = (_controller.value + (index * 0.33)) % 1.0;
                final radius = 50.0 + (progress * 55.0);
                final opacity = (1.0 - progress).clamp(0.0, 1.0) * 0.35;

                return Container(
                  width: radius * 2,
                  height: radius * 2,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: const Color(0xFF4A0080).withValues(alpha: opacity * 0.4),
                    border: Border.all(
                      color: const Color(0xFF9A67BD).withValues(alpha: opacity),
                      width: 1.5,
                    ),
                  ),
                );
              }),

              // Center Glowing Circle Container
              Container(
                width: 90,
                height: 90,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: const Color(0xFF0C011A),
                  border: Border.all(
                    color: const Color(0xFF9A67BD).withValues(alpha: 0.6),
                    width: 2,
                  ),
                  boxShadow: [
                    BoxShadow(
                      color: const Color(0xFF9A67BD).withValues(alpha: 0.35),
                      blurRadius: 20,
                      spreadRadius: 2,
                    ),
                  ],
                ),
                child: Center(
                  child: SvgPicture.asset(
                    'Assets/whatsapp-svgrepo-com.svg',
                    width: 44,
                    height: 44,
                    colorFilter: const ColorFilter.mode(Color(0xFF9A67BD), BlendMode.srcIn),
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}
