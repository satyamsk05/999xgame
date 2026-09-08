import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'api_service.dart';

class DashboardSyncManager {
  static const String _cacheKey = 'cached_dashboard_header_v1';

  static final ValueNotifier<Map<String, dynamic>> dashboardData = ValueNotifier<Map<String, dynamic>>({});
  static final ValueNotifier<bool> isSyncing = ValueNotifier<bool>(true);
  static final ValueNotifier<bool> isBackendOnline = ValueNotifier<bool>(false);
  static bool _initialized = false;
  static Timer? _healthTimer;

  static Future<void> init() async {
    if (_initialized) return;
    _initialized = true;

    try {
      final prefs = await SharedPreferences.getInstance();
      final cachedStr = prefs.getString(_cacheKey);
      if (cachedStr != null && cachedStr.isNotEmpty) {
        final cachedData = jsonDecode(cachedStr) as Map<String, dynamic>;
        if (cachedData.isNotEmpty && cachedData.containsKey('games')) {
          _stripFinancialData(cachedData);
          dashboardData.value = cachedData;
          isSyncing.value = false;
        }
      }
    } catch (_) {}

    await refreshBackendHealth();
    _healthTimer = Timer.periodic(const Duration(seconds: 15), (_) => refreshBackendHealth());
    syncWithServer();
  }

  static Future<void> refreshBackendHealth() async {
    isBackendOnline.value = await ApiService.isBackendReady();
  }

  static Future<void> dispose() async {
    _healthTimer?.cancel();
    _healthTimer = null;
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
      if (bannersList != null && bannersList.isNotEmpty) rawData['banners'] = bannersList;
      if (gamesList != null && gamesList.isNotEmpty) rawData['games'] = gamesList;
      _stripFinancialData(rawData);
      if (rawData.isNotEmpty) {
        if (!rawData.containsKey('games') || (rawData['games'] as List?)?.isEmpty == true) rawData['games'] = _defaultFallbackData['games'];
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

  static void _stripFinancialData(Map<String, dynamic> data) {
    final profile = data['profile'];
    if (profile is Map<String, dynamic>) {
      profile.remove('balance');
      profile.remove('depositBalance');
      profile.remove('winningsBalance');
      profile.remove('rewardsBalance');
      profile.remove('totalBalance');
    }

    final wallet = data['wallet'];
    if (wallet is Map<String, dynamic>) {
      wallet.remove('balance');
      wallet.remove('depositBalance');
      wallet.remove('winningsBalance');
      wallet.remove('rewardsBalance');
      wallet.remove('totalBalance');
    }
  }

  static final Map<String, dynamic> _defaultFallbackData = {
    'profile': {
      'username': 'Guest', 'avatarUrl': '/avatars/avatar_1.png', 'avatarFrameUrl': '/frames/golden_ring.png',
      'ringColor': '#E1B219', 'phoneNumber': '', 'isKycVerified': false, 'currencySymbol': '₹',
    },
    'onlinePlayers': {
      'totalOnline': 0, 'ringColors': ['#FFD700', '#FF9800', '#4FC3F7'],
      'avatars': ['/avatars/avatar_1.png', '/avatars/avatar_2.png', '/avatars/avatar_3.png'],
    },
    'banners': [
      {'id': 'deposit_bonus_180', 'tag': 'DEPOSIT', 'title': 'DEPOSIT BONUS\n180% BONUS', 'subtitle': 'DEPOSIT -> GET BONUS', 'buttonText': 'DEPOSIT NOW', 'imageUrl': '/banners/deposit_banner.png', 'targetScreen': '/add-cash'},
    ],
    'games': [
      {'id': 'seven_up_down', 'title': '7 Up Down (Dice)', 'imagePath': 'Assets/images/7updown.png', 'accentColor': '#FF4081', 'gameUrl': '/games/seven_up_down/index.html', 'isAvailable': true},
      {'id': 'dragon_tiger', 'title': 'Dragon Vs Tiger', 'imagePath': 'Assets/images/dtgame.png', 'accentColor': '#FFD700', 'gameUrl': '/games/dragon_tiger/index.html', 'isAvailable': true},
      {'id': 'crush', 'title': 'Crush', 'imagePath': 'Assets/images/classic_dice.png', 'accentColor': '#00E676', 'gameUrl': '/games/crush/index.html', 'isAvailable': true},
      {'id': 'mines', 'title': 'Mines', 'imagePath': 'Assets/images/mines.png', 'accentColor': '#7C4DFF', 'gameUrl': '/games/mines/index.html', 'isAvailable': false},
    ],
  };
}