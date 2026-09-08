import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'api_service.dart';

class DashboardSyncManager {
  static const String _cacheKey = 'cached_dashboard_header_v1';

  static final ValueNotifier<Map<String, dynamic>> dashboardData =
      ValueNotifier<Map<String, dynamic>>({});

  static final ValueNotifier<bool> isSyncing = ValueNotifier<bool>(true);
  static bool _initialized = false;

  static Future<void> init() async {
    if (_initialized) return;
    _initialized = true;

    try {
      final prefs = await SharedPreferences.getInstance();
      final cachedStr = prefs.getString(_cacheKey);
      if (cachedStr != null && cachedStr.isNotEmpty) {
        final cachedData = jsonDecode(cachedStr) as Map<String, dynamic>;
        if (cachedData.isNotEmpty && cachedData.containsKey('games')) {
          dashboardData.value = cachedData;
          isSyncing.value = false;
        }
      }
    } catch (_) {}

    // Direct Pure Server-Driven Fetch
    syncWithServer();
  }

  static Future<void> syncWithServer() async {
    isSyncing.value = true;
    try {
      final response = await ApiService.getDashboardHeader();
      final bannersList = await ApiService.getBanners();
      final gamesList = await ApiService.getGamesList();

      final Map<String, dynamic> rawData = (response != null && response.containsKey('data') && response['data'] is Map<String, dynamic>)
          ? Map<String, dynamic>.from(response['data'])
          : (response != null ? Map<String, dynamic>.from(response) : <String, dynamic>{});

      if (bannersList != null && bannersList.isNotEmpty) {
        rawData['banners'] = bannersList;
      }

      if (gamesList != null && gamesList.isNotEmpty) {
        rawData['games'] = gamesList;
      }

      if (rawData.isNotEmpty) {
        if (!rawData.containsKey('games') || (rawData['games'] as List?)?.isEmpty == true) {
          rawData['games'] = _defaultFallbackData['games'];
        }

        try {
          final prefs = await SharedPreferences.getInstance();
          await prefs.setString(_cacheKey, jsonEncode(rawData));
        } catch (_) {}

        dashboardData.value = rawData;
      }
    } catch (e) {
      debugPrint('DashboardSyncManager error: $e');
    } finally {
      if (dashboardData.value.isEmpty || (dashboardData.value['games'] as List?)?.isEmpty == true) {
        dashboardData.value = Map<String, dynamic>.from(_defaultFallbackData);
      }
      isSyncing.value = false;
    }
  }


  static final Map<String, dynamic> _defaultFallbackData = {
    'profile': {
      'username': 'Player_0480',
      'avatarUrl': '/avatars/avatar_1.png',
      'avatarFrameUrl': '/frames/golden_ring.png',
      'ringColor': '#E1B219',
      'balance': 0.0,
      'phoneNumber': '7088800480',
      'isKycVerified': true,
      'profileTag': 'Profile',
      'profileTagColor': '#FFD700',
      'profileTagBg': '#3B0A4E',
      'walletGradientStart': '#00D294',
      'walletGradientEnd': '#00A574',
      'currencySymbol': '₹',
      'addCashLabel': '+',
    },
    'wallet': {
      'depositBalance': 0.0,
      'winningsBalance': 0.0,
      'rewardsBalance': 0.0,
      'totalBalance': 0.0,
      'bestDeal': {'amount': 500, 'cashback': 75, 'tag': 'BEST DEAL'},
    },
    'addCashOffers': [
      {'amount': 200, 'cashback': 25},
      {'amount': 500, 'cashback': 75},
      {'amount': 50, 'cashback': 4},
      {'amount': 100, 'cashback': 10},
    ],
    'referral': {
      'totalEarnings': 30,
      'perReferralTarget': 1000,
      'rewardSteps': {'signUp': 15, 'addCash': 55, 'playGames': 930},
      'recentReferrals': [
        {'name': 'Dh animation', 'date': '09 Dec', 'amount': '₹15', 'avatarPath': '/avatars/avatar_1.png'},
        {'name': 'Harshthakur', 'date': '08 Dec', 'amount': '₹15', 'avatarPath': '/avatars/avatar_2.png'},
        {'name': 'RAHUL', 'date': '07 Dec', 'amount': '₹15', 'avatarPath': '/avatars/avatar_3.png'},
      ],
    },
    'onlinePlayers': {
      'totalOnline': 89156,
      'ringColors': ['#FFD700', '#FF9800', '#4FC3F7'],
      'avatars': [
        '/avatars/avatar_1.png',
        '/avatars/avatar_2.png',
        '/avatars/avatar_3.png',
        '/avatars/avatar_7.png',
        '/avatars/avatar_8.png',
        '/avatars/avatar_9.png',
      ],
    },

    'banners': [
      {
        'id': 'deposit_bonus_180',
        'tag': 'DEPOSIT',
        'title': 'DEPOSIT BONUS\n180% BONUS',
        'subtitle': 'DEPOSIT -> GET BONUS',
        'buttonText': 'DEPOSIT NOW',
        'imageUrl': '/banners/deposit_banner.png',
        'targetScreen': '/add-cash',
      },
    ],
    'games': [
      {
        'id': 'classic_dice',
        'title': 'Classic Dice',
        'imagePath': '/games/classic_dice.png',
        'accentColor': '#00E676',
        'gameUrl': '/games/seven_up_down/index.html',
        'isAvailable': true,
      },
      {
        'id': 'double',
        'title': 'Double',
        'imagePath': '/games/double.png',
        'accentColor': '#FFD700',
        'gameUrl': '/games/seven_up_down/index.html',
        'isAvailable': false,
      },
      {
        'id': '7updown',
        'title': '7 Up Down',
        'imagePath': '/games/7updown.png',
        'accentColor': '#FF4081',
        'gameUrl': '/games/seven_up_down/index.html',
        'isAvailable': true,
      },
      {
        'id': 'mines',
        'title': 'Mines',
        'imagePath': '/games/mines.png',
        'accentColor': '#7C4DFF',
        'gameUrl': '/games/seven_up_down/index.html',
        'isAvailable': false,
      },
    ],
  };

  static void updateLocalBalance(double newBalance) {
    try {
      final currentMap = Map<String, dynamic>.from(dashboardData.value);
      final profileMap = Map<String, dynamic>.from(currentMap['profile'] ?? {});
      profileMap['balance'] = newBalance;
      currentMap['profile'] = profileMap;
      dashboardData.value = currentMap;

      SharedPreferences.getInstance().then((prefs) {
        prefs.setString(_cacheKey, jsonEncode(currentMap));
      });
    } catch (_) {}
  }
}
