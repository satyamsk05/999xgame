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

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  SystemChrome.setSystemUIOverlayStyle(
    const SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      statusBarIconBrightness: Brightness.light,
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
  bool _isLoggedIn = false;
  int _currentNavIndex = 0;
  double _depositBalance = 0.0;
  double _winningsBalance = 0.0;
  final double _rewardsBalance = 0.0;
  String _userName = 'Player';
  String _phoneNumber = '';
  String _currentAvatarPath = 'assets/avatar/avatar_1.png';
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
  String _selectedGameTitle = '7 Up Down (Dice)';
  double _selectedEntryFee = 10.0;
  double _selectedPrizePool = 18.0;
  String _selectedGameUrl = '/games/seven_up_down/index.html';
  String _transactionsFilter = 'All';

  @override
  void initState() {
    super.initState();
    _fetchUserData();
  }

  Future<void> _fetchUserData() async {
    final profile = await ApiService.getUserProfile();
    if (profile != null && profile['data'] != null) {
      final d = profile['data'];
      if (mounted) {
        setState(() {
          _depositBalance = (d['depositBalance'] as num?)?.toDouble() ?? 0.0;
          _winningsBalance = (d['winningsBalance'] as num?)?.toDouble() ?? 0.0;
          if (d['username'] != null && d['username'].toString().isNotEmpty) {
            _userName = d['username'].toString();
          }
          if (d['phone'] != null) {
            _phoneNumber = d['phone'].toString();
          }
        });
      }
    }

    final txs = await ApiService.getTransactions();
    if (txs != null && mounted) {
      setState(() {
        _transactionsList.clear();
        for (var t in txs) {
          _transactionsList.add(
            TransactionItemData(
              id: t['id']?.toString() ?? '',
              title: t['title']?.toString() ?? 'Transaction',
              amount: (t['amount'] as num?)?.toDouble() ?? 0.0,
              isCredit: t['isCredit'] == true,
              timestamp: DateTime.tryParse(t['timestamp']?.toString() ?? '') ?? DateTime.now(),
              category: t['category']?.toString() ?? 'General',
            ),
          );
        }
      });
    }
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
            // Top Profile Header & Live Online Ticker (Wrapped in SafeArea top only)
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
                child: Column(
                  children: [
                    TopHeader(
                      username: _userName,
                      userTag: 'Profile',
                      balance: _totalBalance,
                      avatarPath: _currentAvatarPath,
                      onAddMoneyPressed: () {
                        setState(() {
                          _isProfilePageActive = false;
                          _currentNavIndex = 2;
                        });
                      },
                      onProfilePressed: () {
                        setState(() {
                          _isProfilePageActive = true;
                        });
                      },
                    ),
                    const OnlineTicker(
                      onlineCount: '89,156 online',
                    ),
                    const SizedBox(height: 4),
                  ],
                ),
              ),

            // Main Screen Content
            Expanded(
              child: _isHtml5GameActive
                  ? Html5GameScreen(
                      gameTitle: _selectedGameTitle,
                      entryFee: _selectedEntryFee,
                      prizePool: _selectedPrizePool,
                      gameUrl: _selectedGameUrl,
                      onBackPressed: () {
                        setState(() {
                          _isHtml5GameActive = false;
                        });
                        _fetchUserData();
                      },
                      onBalanceUpdated: (newBalance) {
                        _fetchUserData();
                      },
                    )
                  : _isHelpCentrePageActive
                  ? HelpCentreScreen(
                      onBackPressed: () {
                        setState(() {
                          _isHelpCentrePageActive = false;
                        });
                      },
                    )
                  : _isReportedIssuesPageActive
                      ? ReportedIssuesScreen(
                          onBackPressed: () {
                            setState(() {
                              _isReportedIssuesPageActive = false;
                            });
                          },
                        )
                      : _isAboutUsPageActive
                          ? AboutUsScreen(
                              onBackPressed: () {
                                setState(() {
                                  _isAboutUsPageActive = false;
                                });
                              },
                            )
                          : _isContactUsPageActive
                              ? ContactUsScreen(
                                  onBackPressed: () {
                                    setState(() {
                                      _isContactUsPageActive = false;
                                    });
                                  },
                                )
                              : _isFairPlayPageActive
                                  ? FairPlayScreen(
                                      onBackPressed: () {
                                        setState(() {
                                          _isFairPlayPageActive = false;
                                        });
                                      },
                                    )
                                  : _isSettingsPageActive
                                      ? SettingsScreen(
                                          onBackPressed: () {
                                            setState(() {
                                              _isSettingsPageActive = false;
                                            });
                                          },
                                          onAddCashTap: () {
                                            setState(() {
                                              _isSettingsPageActive = false;
                                              _isProfilePageActive = false;
                                              _isWithdrawPageActive = false;
                                              _isTransactionsPageActive = false;
                                              _currentNavIndex = 2;
                                            });
                                          },
                                          onTransactionHistoryTap: () {
                                            setState(() {
                                              _isSettingsPageActive = false;
                                              _isProfilePageActive = false;
                                              _isWithdrawPageActive = false;
                                              _isTransactionsPageActive = true;
                                              _transactionsFilter = 'All';
                                            });
                                          },
                                          onWithdrawalsTap: () {
                                            setState(() {
                                              _isSettingsPageActive = false;
                                              _isProfilePageActive = false;
                                              _isWithdrawPageActive = false;
                                              _isTransactionsPageActive = true;
                                              _transactionsFilter = 'Withdraw';
                                            });
                                          },
                                          onHelpCentreTap: () {
                                            setState(() {
                                              _isHelpCentrePageActive = true;
                                            });
                                          },
                                          onReportedIssuesTap: () {
                                            setState(() {
                                              _isReportedIssuesPageActive = true;
                                            });
                                          },
                                          onAboutUsTap: () {
                                            setState(() {
                                              _isAboutUsPageActive = true;
                                            });
                                          },
                                          onContactUsTap: () {
                                            setState(() {
                                              _isContactUsPageActive = true;
                                            });
                                          },
                                          onFairPlayTap: () {
                                            setState(() {
                                              _isFairPlayPageActive = true;
                                            });
                                          },
                                        )
                  : _isTransactionsPageActive
                      ? TransactionsScreen(
                          transactions: _transactionsList,
                          initialFilter: _transactionsFilter,
                          onBackPressed: () {
                            setState(() {
                              _isTransactionsPageActive = false;
                            });
                          },
                        )
                      : _isProfilePageActive
                          ? SafeArea(
                              bottom: false,
                              child: ProfileScreen(
                                username: _userName,
                                phoneNumber: _phoneNumber,
                                walletBalance: _totalBalance,
                                avatarPath: _currentAvatarPath,
                                onBackPressed: () {
                                  setState(() {
                                    _isProfilePageActive = false;
                                  });
                                },
                                onAddCashTap: () {
                                  setState(() {
                                    _isProfilePageActive = false;
                                    _currentNavIndex = 2;
                                  });
                                },
                                onAvatarChanged: (newPath) async {
                                  setState(() {
                                    _currentAvatarPath = newPath;
                                  });
                                  await ApiService.updateUserProfile(avatarPath: newPath);
                                  _fetchUserData();
                                },
                                onUsernameChanged: (newName) async {
                                  setState(() {
                                    _userName = newName;
                                  });
                                  await ApiService.updateUserProfile(username: newName);
                                  _fetchUserData();
                                },
                                onTransactionHistoryTap: () {
                                  setState(() {
                                    _isProfilePageActive = false;
                                    _isTransactionsPageActive = true;
                                    _transactionsFilter = 'All';
                                  });
                                },
                                onSettingsTap: () {
                                  setState(() {
                                    _isProfilePageActive = false;
                                    _isSettingsPageActive = true;
                                  });
                                },
                                onLogoutTap: () {
                                  setState(() {
                                    _isProfilePageActive = false;
                                    _isLoggedIn = false;
                                  });
                                },
                              ),
                            )
                          : _isWithdrawPageActive
                              ? WithdrawScreen(
                                  winningsBalance: _winningsBalance,
                                  onBackPressed: () {
                                    setState(() {
                                      _isWithdrawPageActive = false;
                                    });
                                  },
                                  onWithdrawCompleted: (grossAmount, netAmount, isDepositBack) {
                                    setState(() {
                                      _isWithdrawPageActive = false;
                                    });
                                    _fetchUserData();
                                  },
                                )
                              : IndexedStack(
                      index: _currentNavIndex,
                      children: [
                        _buildHomeTab(),
                        SafeArea(
                          bottom: false,
                          child: const ShareScreen(),
                        ),
                        SafeArea(
                          bottom: false,
                          child: AddCashScreen(
                            currentBalance: _totalBalance,
                            onAddCashCompleted: (addedAmount) {
                              _fetchUserData();
                            },
                          ),
                        ),
                        SafeArea(
                          bottom: false,
                          child: WalletScreen(
                            totalBalance: _totalBalance,
                            depositBalance: _depositBalance,
                            winningsBalance: _winningsBalance,
                            rewardsBalance: _rewardsBalance,
                            onAddCashTap: () {
                              setState(() {
                                _isProfilePageActive = false;
                                _currentNavIndex = 2;
                              });
                            },
                            onWithdrawTap: () {
                              setState(() {
                                _isProfilePageActive = false;
                                _isWithdrawPageActive = true;
                              });
                            },
                            onAllTransactionsTap: () {
                              setState(() {
                                _isProfilePageActive = false;
                                _isWithdrawPageActive = false;
                                _isSettingsPageActive = false;
                                _isTransactionsPageActive = true;
                                _transactionsFilter = 'All';
                              });
                            },
                            onSupportTap: () {
                              ScaffoldMessenger.of(context).showSnackBar(
                                SnackBar(
                                  content: Text(
                                    'Customer Support opened',
                                    style: GoogleFonts.poppins(),
                                  ),
                                  backgroundColor: const Color(0xFF6A1B82),
                                  behavior: SnackBarBehavior.floating,
                                ),
                              );
                            },
                            onSettingsTap: () {
                              setState(() {
                                _isProfilePageActive = false;
                                _isWithdrawPageActive = false;
                                _isTransactionsPageActive = false;
                                _isSettingsPageActive = true;
                              });
                            },
                          ),
                        ),
                      ],
                    ),
            ),

            // Custom Bottom Navigation Bar (Extends to screen edge - Hidden during HTML5 gameplay)
            if (!_isHtml5GameActive)
              CustomBottomNavBar(
              selectedIndex: (_isProfilePageActive ||
                      _isWithdrawPageActive ||
                      _isSettingsPageActive ||
                      _isTransactionsPageActive ||
                      _isHelpCentrePageActive ||
                      _isReportedIssuesPageActive ||
                      _isAboutUsPageActive ||
                      _isContactUsPageActive ||
                      _isFairPlayPageActive)
                  ? -1
                  : _currentNavIndex,
              onItemSelected: (index) {
                setState(() {
                  _isProfilePageActive = false;
                  _isWithdrawPageActive = false;
                  _isSettingsPageActive = false;
                  _isTransactionsPageActive = false;
                  _isHelpCentrePageActive = false;
                  _isReportedIssuesPageActive = false;
                  _isAboutUsPageActive = false;
                  _isContactUsPageActive = false;
                  _isFairPlayPageActive = false;
                  _currentNavIndex = index;
                });
              },
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

  Widget _buildHomeTab() {
    return SingleChildScrollView(
      physics: const BouncingScrollPhysics(),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          PromoBanner(
            onTap: () {
              setState(() {
                _currentNavIndex = 2;
              });
            },
          ),
          const SizedBox(height: 8),
          const SizedBox(height: 10),
          SizedBox(
            height: 265,
            child: ListView(
              clipBehavior: Clip.none,
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.only(top: 10, left: 16.0, right: 16.0, bottom: 5),
              children: [
                GameCard(
                  data: const GameCardData(
                    title: '7 Up Down (Dice)',
                    category: 'Dice • HOT 🔥',
                    imagePath: 'assets/images/7updown.png',
                    playersOnline: '4,520 playing',
                    accentColor: Color(0xFF00E676),
                  ),
                  onTap: () => _launchHtml5Game('7 Up Down (Dice)', 10.0, 20.0, '/games/seven_up_down/index.html'),
                ),
                GameCard(
                  data: const GameCardData(
                    title: 'Dragon Vs Tiger',
                    category: 'Cards • NEW 🚀',
                    imagePath: 'assets/images/dtgame.png',
                    playersOnline: '3,120 playing',
                    accentColor: Color(0xFFFF1744),
                  ),
                  onTap: () => _launchHtml5Game('Dragon Vs Tiger', 10.0, 20.0, '/games/seven_up_down/index.html'),
                ),
                GameCard(
                  data: const GameCardData(
                    title: 'Fruit Slice Ninja',
                    category: 'Arcade • HTML5',
                    imagePath: 'assets/images/promo.jpg',
                    playersOnline: '1,420 playing',
                    accentColor: Color(0xFF00E676),
                  ),
                  onTap: () => _launchHtml5Game('Fruit Slice Ninja', 10.0, 18.0, '/games/fruit_slice/index.html'),
                ),
                GameCard(
                  data: const GameCardData(
                    title: 'Ludo Express',
                    category: 'Board • HTML5',
                    imagePath: 'assets/images/ludo.jpg',
                    playersOnline: '3,890 playing',
                    accentColor: Color(0xFFFFB300),
                  ),
                  onTap: () => _launchHtml5Game('Ludo Express', 20.0, 36.0, '/games/fruit_slice/index.html'),
                ),
                GameCard(
                  data: const GameCardData(
                    title: 'Call Break Pro',
                    category: 'Cards • HTML5',
                    imagePath: 'assets/images/rummy.jpg',
                    playersOnline: '890 playing',
                    accentColor: Color(0xFFE040FB),
                  ),
                  onTap: () => _launchHtml5Game('Call Break Pro', 50.0, 90.0, '/games/fruit_slice/index.html'),
                ),
                GameCard(
                  data: const GameCardData(
                    title: 'Carrom Clash',
                    category: 'Board • HTML5',
                    imagePath: 'assets/images/dtgame.png',
                    playersOnline: '2,150 playing',
                    accentColor: Color(0xFF00B0FF),
                  ),
                  onTap: () => _launchHtml5Game('Carrom Clash', 15.0, 27.0, '/games/fruit_slice/index.html'),
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),
        ],
      ),
    );
  }


}
