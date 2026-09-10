import 'dart:async';
import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';

import 'theme/app_colors.dart';
import 'widgets/top_header.dart';
import 'widgets/online_ticker.dart';
import 'widgets/bottom_nav_bar.dart';

import 'screens/add_cash_screen.dart';
import 'screens/profile_screen.dart';
import 'screens/wallet_screen.dart';
import 'screens/share_screen.dart';
import 'screens/withdraw_screen.dart';
import 'screens/settings_screen.dart';
import 'screens/transactions_screen.dart';
import 'screens/help_centre_screen.dart';
import 'screens/reported_issues_screen.dart';
import 'screens/about_us_screen.dart';
import 'screens/contact_us_screen.dart';
import 'screens/fair_play_screen.dart';
import 'widgets/mobile_device_frame.dart';
import 'widgets/game_card.dart';
import 'widgets/promo_banner.dart';
import 'screens/login_screen.dart';
import 'screens/html5_game_screen.dart';
import 'services/api_service.dart';
import 'services/supabase_service.dart';
import 'services/dashboard_sync_manager.dart';
import 'core/storage/token_manager.dart';
import 'features/wallet/data/wallet_api.dart';

class CustomMouseScrollBehavior extends MaterialScrollBehavior {
  const CustomMouseScrollBehavior();

  @override
  Set<PointerDeviceKind> get dragDevices => {
        PointerDeviceKind.touch,
        PointerDeviceKind.mouse,
        PointerDeviceKind.trackpad,
        PointerDeviceKind.stylus,
      };
}

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await SupabaseService.initialize();
  await TokenManager.init();
  
  // Enable immersive sticky fullscreen mode
  await SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);
  
  SystemChrome.setSystemUIOverlayStyle(
    const SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      statusBarIconBrightness: Brightness.light,
      statusBarBrightness: Brightness.dark,
      systemNavigationBarColor: Colors.transparent,
      systemNavigationBarIconBrightness: Brightness.light,
      systemNavigationBarDividerColor: Colors.transparent,
    ),
  );
  runApp(const InGamesApp());
}

class InGamesApp extends StatelessWidget {
  const InGamesApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'InGames',
      debugShowCheckedModeBanner: false,
      scrollBehavior: const CustomMouseScrollBehavior(),
      theme: ThemeData(
        brightness: Brightness.dark,
        scaffoldBackgroundColor: AppColors.backgroundStart,
        textTheme: GoogleFonts.poppinsTextTheme(ThemeData.dark().textTheme),
        fontFamily: GoogleFonts.poppins().fontFamily,
        useMaterial3: true,
      ),
      home: const MobileDeviceFrame(
        child: InGamesHomeScreen(),
      ),
    );
  }
}

class InGamesHomeScreen extends StatefulWidget {
  const InGamesHomeScreen({super.key});

  @override
  State<InGamesHomeScreen> createState() => _InGamesHomeScreenState();
}

class _InGamesHomeScreenState extends State<InGamesHomeScreen> {
  bool _isLoggedIn = TokenManager.isAuthenticated;
  int _currentNavIndex = 0;
  double _depositBalance = 0.0;
  double _winningsBalance = 0.0;
  final double _rewardsBalance = 0.0;
  String _userName = 'Player';
  String _phoneNumber = '';
  String _currentAvatarPath = 'Assets/Avatar/avatar_1.png';
  bool _isProfilePageActive = false;
  bool _isWithdrawPageActive = false;
  bool _isSettingsPageActive = false;
  bool _isTransactionsPageActive = false;
  bool _isHelpCentrePageActive = false;
  bool _isReportedIssuesPageActive = false;
  bool _isAboutUsPageActive = false;
  bool _isContactUsPageActive = false;
  bool _isFairPlayPageActive = false;
  bool _isHtml5GameActive = false;
  String _selectedGameTitle = 'Classic Dice';
  double _selectedEntryFee = 10.0;
  double _selectedPrizePool = 20.0;
  String _selectedGameUrl = '/games/seven_up_down/index.html';
  String _transactionsFilter = 'All';
  bool _isOffline = false;
  Timer? _networkPingTimer;

  @override
  void initState() {
    super.initState();
    DashboardSyncManager.init();
    if (_isLoggedIn) {
      _fetchUserData();
    }
    _startNetworkMonitoring();
  }

  @override
  void dispose() {
    _networkPingTimer?.cancel();
    super.dispose();
  }

  int _consecutivePingFailures = 0;

  void _startNetworkMonitoring() {
    _networkPingTimer?.cancel();
    _networkPingTimer = Timer.periodic(const Duration(seconds: 12), (timer) async {
      if (!mounted || !_isLoggedIn) return;
      final ready = await ApiService.isBackendReady(timeout: const Duration(seconds: 5));
      if (!mounted) return;
      if (ready) {
        _consecutivePingFailures = 0;
        if (_isOffline) {
          setState(() => _isOffline = false);
          _fetchUserData();
        }
      } else {
        _consecutivePingFailures++;
        if (_consecutivePingFailures >= 4 && !_isOffline) {
          setState(() => _isOffline = true);
        }
      }
    });
  }

  Future<void> _fetchUserData() async {
    DashboardSyncManager.syncWithServer();
    try {
      final profile = await WalletApi.getUserProfile();
      if (mounted) {
        setState(() {
          _depositBalance = (profile['depositBalance'] as num?)?.toDouble() ?? 0.0;
          _winningsBalance = (profile['winningsBalance'] as num?)?.toDouble() ?? 0.0;
          if (profile['username'] != null && profile['username'].toString().isNotEmpty) {
            _userName = profile['username'].toString();
          }
          if (profile['phoneNumber'] != null) {
            _phoneNumber = profile['phoneNumber'].toString();
          }
          if (profile['avatarPath'] != null && profile['avatarPath'].toString().isNotEmpty) {
            _currentAvatarPath = ProfileScreen.normalizeAvatarPath(profile['avatarPath'].toString());
          }
        });
      }
    } catch (_) {}

    try {
      final txRes = await WalletApi.getTransactions();
      final items = txRes['items'] as List<dynamic>? ?? [];
      if (mounted) {
        setState(() {
          _transactionsList.clear();
          for (var t in items) {
            _transactionsList.add(
              TransactionItemData(
                id: t['id']?.toString() ?? '',
                title: t['title']?.toString() ?? 'Transaction',
                amount: (t['amount'] as num?)?.toDouble() ?? 0.0,
                isCredit: t['isCredit'] == true,
                timestamp: DateTime.tryParse(t['timestamp']?.toString() ?? '') ?? DateTime.now(),
                category: t['category']?.toString() ?? 'General',
                status: t['status']?.toString(),
                utr: t['utr']?.toString(),
              ),
            );
          }
        });
      }
    } catch (_) {}
  }

  final List<TransactionItemData> _transactionsList = [];

  double get _totalBalance => _depositBalance + _winningsBalance + _rewardsBalance;

  bool get _hasActiveSubScreen =>
      _isHtml5GameActive ||
      _isHelpCentrePageActive ||
      _isReportedIssuesPageActive ||
      _isAboutUsPageActive ||
      _isContactUsPageActive ||
      _isFairPlayPageActive ||
      _isSettingsPageActive ||
      _isTransactionsPageActive ||
      _isProfilePageActive ||
      _isWithdrawPageActive;

  void _popTopScreen() {
    setState(() {
      if (_isHtml5GameActive) {
        _isHtml5GameActive = false;
      } else if (_isHelpCentrePageActive) {
        _isHelpCentrePageActive = false;
      } else if (_isReportedIssuesPageActive) {
        _isReportedIssuesPageActive = false;
      } else if (_isAboutUsPageActive) {
        _isAboutUsPageActive = false;
      } else if (_isContactUsPageActive) {
        _isContactUsPageActive = false;
      } else if (_isFairPlayPageActive) {
        _isFairPlayPageActive = false;
      } else if (_isSettingsPageActive) {
        _isSettingsPageActive = false;
      } else if (_isTransactionsPageActive) {
        _isTransactionsPageActive = false;
      } else if (_isProfilePageActive) {
        _isProfilePageActive = false;
      } else if (_isWithdrawPageActive) {
        _isWithdrawPageActive = false;
      } else if (_currentNavIndex != 0) {
        _currentNavIndex = 0;
      }
    });
  }

  void _handleLogout() {
    unawaited(_performLogout());
  }

  Future<void> _performLogout() async {
    try {
      if (TokenManager.token != null && TokenManager.token!.isNotEmpty) {
        await ApiService.logout();
      }
    } catch (_) {
      // Local logout must still complete if the backend is unavailable.
    } finally {
      await TokenManager.clearSession();
      await SupabaseService.signOut();
    }

    if (!mounted) return;
    setState(() {
      _isLoggedIn = false;
      _isProfilePageActive = false;
      _isWithdrawPageActive = false;
      _isSettingsPageActive = false;
      _isTransactionsPageActive = false;
      _isHelpCentrePageActive = false;
      _isReportedIssuesPageActive = false;
      _isAboutUsPageActive = false;
      _isContactUsPageActive = false;
      _isFairPlayPageActive = false;
      _isHtml5GameActive = false;
      _currentNavIndex = 0;
      _depositBalance = 0.0;
      _winningsBalance = 0.0;
      _userName = 'Player';
      _phoneNumber = '';
      _currentAvatarPath = 'Assets/Avatar/avatar_1.png';
      _transactionsList.clear();
    });
  }

  @override
  Widget build(BuildContext context) {
    if (!_isLoggedIn) {
      return LoginScreen(
        onLoginSuccess: (data) {
          setState(() {
            _isLoggedIn = true;
            if (data['data'] != null) {
              final user = data['data'];
              if (user['phoneNumber'] != null) {
                _phoneNumber = user['phoneNumber'].toString();
              }
              if (user['username'] != null) {
                _userName = user['username'].toString();
              }
              if (user['avatarPath'] != null && user['avatarPath'].toString().isNotEmpty) {
                _currentAvatarPath = ProfileScreen.normalizeAvatarPath(user['avatarPath'].toString());
              }
            }
          });
          _fetchUserData();
        },
      );
    }

    return PopScope(
      canPop: !_hasActiveSubScreen && _currentNavIndex == 0,
      onPopInvokedWithResult: (didPop, result) {
        if (!didPop) {
          _popTopScreen();
        }
      },
      child: Scaffold(
        backgroundColor: AppColors.backgroundStart,
        body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [
              AppColors.backgroundStart,
              AppColors.backgroundEnd,
            ],
          ),
        ),
        child: Column(
          children: [
            if (_currentNavIndex == 0 &&
                !_isProfilePageActive &&
                !_isSettingsPageActive &&
                !_isTransactionsPageActive &&
                !_isWithdrawPageActive &&
                !_isHelpCentrePageActive &&
                !_isReportedIssuesPageActive &&
                !_isAboutUsPageActive &&
                !_isContactUsPageActive &&
                !_isFairPlayPageActive &&
                !_isHtml5GameActive)
              SafeArea(
                bottom: false,
                child: ValueListenableBuilder<bool>(
                  valueListenable: DashboardSyncManager.isSyncing,
                  builder: (context, syncing, child) {
                    return ValueListenableBuilder<Map<String, dynamic>>(
                      valueListenable: DashboardSyncManager.dashboardData,
                      builder: (context, data, child) {
                        final profileMap = data['profile'] as Map<String, dynamic>? ?? {};
                        final onlineMap = data['onlinePlayers'] as Map<String, dynamic>? ?? {};
                        final name = (profileMap['username'] != null && profileMap['username'].toString().isNotEmpty) ? profileMap['username'].toString() : _userName;
                        final bal = _totalBalance;
                        final av = (profileMap['avatarUrl'] != null && profileMap['avatarUrl'].toString().isNotEmpty) ? profileMap['avatarUrl'].toString() : _currentAvatarPath;
                        final countVal = onlineMap['totalOnline'];
                        Color parseHex(String? hex, Color fallback) {
                          if (hex == null || hex.isEmpty) return fallback;
                          try { return Color(int.parse(hex.replaceFirst('#', '0xFF'))); } catch (_) { return fallback; }
                        }
                        final ringColor = parseHex(profileMap['ringColor'] as String?, const Color(0xFFE1B219));
                        final profileTagColor = parseHex(profileMap['profileTagColor'] as String?, const Color(0xFFFFD700));
                        final profileTagBg = parseHex(profileMap['profileTagBg'] as String?, const Color(0xFF3B0A4E));
                        final walletGradientStart = parseHex(profileMap['walletGradientStart'] as String?, const Color(0xFF00D294));
                        final walletGradientEnd = parseHex(profileMap['walletGradientEnd'] as String?, const Color(0xFF00A574));
                        final currencySymbol = (profileMap['currencySymbol'] as String?) ?? '₹';
                        final addCashLabel = (profileMap['addCashLabel'] as String?) ?? '+';
                        final userTag = (profileMap['profileTag'] as String?) ?? 'Profile';
                        final isHeaderLoading = syncing && data.isEmpty;
                        return Column(
                          children: [
                            TopHeader(
                              username: name, userTag: userTag, balance: bal, avatarPath: av, isLoading: isHeaderLoading,
                              ringColor: ringColor, profileTagColor: profileTagColor, profileTagBg: profileTagBg,
                              walletGradientStart: walletGradientStart, walletGradientEnd: walletGradientEnd,
                              currencySymbol: currencySymbol, addCashLabel: addCashLabel,
                              onAddMoneyPressed: () { setState(() { _isProfilePageActive = false; _isWithdrawPageActive = false; _isSettingsPageActive = false; _isTransactionsPageActive = false; _currentNavIndex = 2; }); },
                              onProfilePressed: () { setState(() { _isProfilePageActive = true; }); },
                            ),
                            OnlineTicker(onlineCount: countVal != null ? '$countVal online' : '89,156 online', isLoading: isHeaderLoading),
                            const SizedBox(height: 4),
                          ],
                        );
                      },
                    );
                  },
                ),
              ),
            Expanded(
              child: _isHtml5GameActive
                  ? Html5GameScreen(
                      gameTitle: _selectedGameTitle, entryFee: _selectedEntryFee, prizePool: _selectedPrizePool, gameUrl: _selectedGameUrl,
                      onBackPressed: () { setState(() { _isHtml5GameActive = false; }); _fetchUserData(); },
                      onBalanceUpdated: (newBalance) { _fetchUserData(); },
                    )
                  : _isHelpCentrePageActive
                          ? HelpCentreScreen(onBackPressed: () { setState(() { _isHelpCentrePageActive = false; }); })
                          : _isReportedIssuesPageActive
                              ? ReportedIssuesScreen(onBackPressed: () { setState(() { _isReportedIssuesPageActive = false; }); })
                              : _isAboutUsPageActive
                                  ? AboutUsScreen(onBackPressed: () { setState(() { _isAboutUsPageActive = false; }); })
                                  : _isContactUsPageActive
                                      ? ContactUsScreen(onBackPressed: () { setState(() { _isContactUsPageActive = false; }); })
                                      : _isFairPlayPageActive
                                          ? FairPlayScreen(onBackPressed: () { setState(() { _isFairPlayPageActive = false; }); })
                                          : _isSettingsPageActive
                                              ? SettingsScreen(
                                                  onBackPressed: () { setState(() { _isSettingsPageActive = false; }); },
                                                  onAddCashTap: () { setState(() { _isSettingsPageActive = false; _isWithdrawPageActive = false; _isTransactionsPageActive = false; _isProfilePageActive = true; }); },
                                                  onTransactionHistoryTap: () { setState(() { _isSettingsPageActive = false; _isProfilePageActive = false; _isWithdrawPageActive = false; _isTransactionsPageActive = true; _transactionsFilter = 'All'; }); },
                                                  onWithdrawalsTap: () { setState(() { _isSettingsPageActive = false; _isProfilePageActive = false; _isWithdrawPageActive = false; _isTransactionsPageActive = true; _transactionsFilter = 'Withdraw'; }); },
                                                  onHelpCentreTap: () { setState(() { _isHelpCentrePageActive = true; }); },
                                                  onReportedIssuesTap: () { setState(() { _isReportedIssuesPageActive = true; }); },
                                                  onAboutUsTap: () { setState(() { _isAboutUsPageActive = true; }); },
                                                  onContactUsTap: () { setState(() { _isContactUsPageActive = true; }); },
                                                  onLogoutTap: _handleLogout,
                                                  onFairPlayTap: () { setState(() { _isFairPlayPageActive = true; }); },
                                                )
                                              : _isTransactionsPageActive
                                                  ? TransactionsScreen(
                                                      transactions: _transactionsList, initialFilter: _transactionsFilter,
                                                      onBackPressed: () { setState(() { _isTransactionsPageActive = false; }); },
                                                    )
                                                  : _isProfilePageActive
                                                      ? SafeArea(
                                                          bottom: false,
                                                          child: ProfileScreen(
                                                            username: _userName, phoneNumber: _phoneNumber, walletBalance: _totalBalance, avatarPath: _currentAvatarPath,
                                                            onBackPressed: () { setState(() { _isProfilePageActive = false; }); },
                                                            onAddCashTap: () { setState(() { _isProfilePageActive = false; _currentNavIndex = 2; }); },
                                                            onContactSupportTap: () { setState(() { _isHelpCentrePageActive = true; }); },
                                                            onAvatarChanged: (newPath) async { setState(() { _currentAvatarPath = newPath; }); await ApiService.updateUserProfile(avatarPath: newPath); _fetchUserData(); },
                                                            onUsernameChanged: (newName) async { setState(() { _userName = newName; }); await ApiService.updateUserProfile(username: newName); _fetchUserData(); },
                                                            onTransactionHistoryTap: () { setState(() { _isProfilePageActive = false; _isTransactionsPageActive = true; _transactionsFilter = 'All'; }); },
                                                            onSettingsTap: () { setState(() { _isProfilePageActive = false; _isSettingsPageActive = true; }); },
                                                            onLogoutTap: () async { await TokenManager.clearSession(); await SupabaseService.signOut(); if (mounted) { setState(() { _isProfilePageActive = false; _isLoggedIn = false; }); } },
                                                          ),
                                                        )
                                                      : _isWithdrawPageActive
                                                          ? WithdrawScreen(
                                                              winningsBalance: _winningsBalance,
                                                              onBackPressed: () { setState(() { _isWithdrawPageActive = false; }); },
                                                              onWithdrawCompleted: (grossAmount, netAmount, isDepositBack) { setState(() { _isWithdrawPageActive = false; }); _fetchUserData(); },
                                                            )
                                                          : IndexedStack(
                                                              index: _currentNavIndex,
                                                              children: [
                                                                _buildHomeTab(),
                                                                SafeArea(bottom: false, child: const ShareScreen()),
                                                                SafeArea(bottom: false, child: AddCashScreen(currentBalance: _totalBalance, onAddCashCompleted: (addedAmount) { _fetchUserData(); })),
                                                                SafeArea(
                                                                  bottom: false,
                                                                  child: WalletScreen(
                                                                    totalBalance: _totalBalance, depositBalance: _depositBalance, winningsBalance: _winningsBalance, rewardsBalance: _rewardsBalance,
                                                                    onAddCashTap: () { setState(() { _isProfilePageActive = false; _currentNavIndex = 2; }); },
                                                                    onWithdrawTap: () { setState(() { _isProfilePageActive = false; _isWithdrawPageActive = true; }); },
                                                                    onAllTransactionsTap: () { setState(() { _isProfilePageActive = false; _isWithdrawPageActive = false; _isSettingsPageActive = false; _isTransactionsPageActive = true; _transactionsFilter = 'All'; }); },
                                                                    onSupportTap: () { ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Customer Support opened', style: GoogleFonts.poppins()), backgroundColor: const Color(0xFF6A1B82), behavior: SnackBarBehavior.floating)); },
                                                                    onSettingsTap: () { setState(() { _isProfilePageActive = false; _isWithdrawPageActive = false; _isTransactionsPageActive = false; _isSettingsPageActive = true; }); },
                                                                  ),
                                                                ),
                                                              ],
                                                            ),
            ),
            if (!_isHtml5GameActive)
              CustomBottomNavBar(
                selectedIndex: (_isProfilePageActive || _isWithdrawPageActive || _isSettingsPageActive || _isTransactionsPageActive || _isHelpCentrePageActive || _isReportedIssuesPageActive || _isAboutUsPageActive || _isContactUsPageActive || _isFairPlayPageActive) ? -1 : _currentNavIndex,
                onItemSelected: (index) { setState(() { _isProfilePageActive = false; _isWithdrawPageActive = false; _isSettingsPageActive = false; _isTransactionsPageActive = false; _isHelpCentrePageActive = false; _isReportedIssuesPageActive = false; _isAboutUsPageActive = false; _isContactUsPageActive = false; _isFairPlayPageActive = false; _currentNavIndex = index; }); },
              ),
          ],
        ),
      ),
      ),
    );
  }

  void _launchHtml5Game(String title, double entryFee, double prizePool, String gameUrl) {
    setState(() {
      _selectedGameTitle = title;
      _selectedEntryFee = entryFee;
      _selectedPrizePool = prizePool;
      _selectedGameUrl = gameUrl;
      _isHtml5GameActive = true;
    });
  }

  void _showComingSoon(String gameTitle) {
    ScaffoldMessenger.of(context).hideCurrentSnackBar();
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Row(
          children: [
            const Icon(Icons.rocket_launch_rounded, color: Color(0xFFFFC107), size: 20),
            const SizedBox(width: 10),
            Text('$gameTitle - Coming Soon! 🚀', style: GoogleFonts.poppins(color: Colors.white, fontWeight: FontWeight.w600, fontSize: 14)),
          ],
        ),
        backgroundColor: const Color(0xFF260435),
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12), side: const BorderSide(color: Color(0xFFFFC107), width: 1.5)),
        duration: const Duration(seconds: 2),
      ),
    );
  }

  Widget _buildHomeTab() {
    return RefreshIndicator(
      color: const Color(0xFFFFD700),
      backgroundColor: const Color(0xFF260435),
      onRefresh: () async {
        await Future.wait([
          _fetchUserData(),
          DashboardSyncManager.syncWithServer(),
        ]);
      },
      child: SingleChildScrollView(
        physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            PromoBanner(onTap: () { setState(() { _currentNavIndex = 2; }); }),
            const SizedBox(height: 18),
            ValueListenableBuilder<bool>(
              valueListenable: DashboardSyncManager.isSyncing,
              builder: (context, syncing, child) {
                return ValueListenableBuilder<Map<String, dynamic>>(
                  valueListenable: DashboardSyncManager.dashboardData,
                  builder: (context, data, child) {
                    final gamesListRaw = data['games'] as List<dynamic>? ?? [];
                    if ((syncing && data.isEmpty) || gamesListRaw.isEmpty) {
                      return SizedBox(
                        height: 260,
                        child: ListView.builder(
                          scrollDirection: Axis.horizontal,
                          padding: const EdgeInsets.symmetric(horizontal: 16),
                          itemCount: 3,
                          itemBuilder: (ctx, i) => const GameCard(
                            data: GameCardData(title: '', imagePath: ''), onTap: _noop, isLoading: true,
                          ),
                        ),
                      );
                    }
                    return SizedBox(
                      height: 270,
                      child: ListView.builder(
                        clipBehavior: Clip.none,
                        scrollDirection: Axis.horizontal,
                        padding: const EdgeInsets.only(left: 16.0, right: 16.0, bottom: 5),
                        itemCount: gamesListRaw.length,
                        itemBuilder: (ctx, index) {
                          final gameObj = gamesListRaw[index] as Map<String, dynamic>? ?? {};
                          final id = gameObj['id']?.toString() ?? '';
                          final title = gameObj['title']?.toString() ?? 'Game';
                          final imagePath = gameObj['imagePath']?.toString() ?? 'Assets/images/7updown.png';
                          final gameUrl = gameObj['gameUrl']?.toString() ?? '/games/seven_up_down/index.html';
                          final isAvailable = gameObj['isAvailable'] == true || gameObj['status'] == 'LIVE';
                          Color accentColor = const Color(0xFF00E676);
                          if (gameObj['accentColor'] != null) {
                            final hex = gameObj['accentColor'].toString().replaceAll('#', '');
                            if (hex.length == 6) { accentColor = Color(int.parse('FF$hex', radix: 16)); }
                          }
                          return GameCard(
                            data: GameCardData(id: id, title: title, imagePath: imagePath, accentColor: accentColor, gameUrl: gameUrl),
                            onTap: () {
                              if (isAvailable || id == 'seven_up_down' || id == '7updown' || id == 'dragon_tiger' || id == 'crush' || id == 'classic_dice') {
                                _launchHtml5Game(title, 10.0, 20.0, gameUrl);
                              } else {
                                _showComingSoon(title);
                              }
                            },
                          );
                        },
                      ),
                    );
                  },
                );
              },
            ),
            const SizedBox(height: 20),
          ],
        ),
      ),
    );
  }

  static void _noop() {}
}
