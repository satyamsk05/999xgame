import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:google_fonts/google_fonts.dart';
import '../services/api_service.dart';
import '../theme/app_colors.dart';
import 'shimmer_loading.dart';

class TopHeader extends StatelessWidget {
  final String username, userTag, avatarPath, currencySymbol, addCashLabel;
  final double balance;
  final VoidCallback onAddMoneyPressed, onProfilePressed;
  final bool isLoading;
  final Color ringColor, profileTagColor, profileTagBg, walletGradientStart, walletGradientEnd;

  const TopHeader({super.key, this.username='Ashu K', this.userTag='Profile', this.balance=1250, this.avatarPath='/avatars/avatar_1.png', required this.onAddMoneyPressed, required this.onProfilePressed, this.isLoading=false, this.ringColor=const Color(0xFFE1B219), this.profileTagColor=const Color(0xFFFFD700), this.profileTagBg=const Color(0xFF3B0A4E), this.walletGradientStart=const Color(0xFF00D294), this.walletGradientEnd=const Color(0xFF00A574), this.currencySymbol='₹', this.addCashLabel='+'});

  static String _cleanPath(String? p) => (p == null || p.isEmpty) ? '/avatars/avatar_1.png' : p;

  @override
  Widget build(BuildContext context) {
    if (isLoading) return Container(padding: const EdgeInsets.only(top:10,bottom:8,left:16,right:16), child: const Row(children:[ShimmerBox(width:58,height:58,borderRadius:29),SizedBox(width:14),Expanded(child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[ShimmerBox(width:110,height:16,borderRadius:8),SizedBox(height:6),ShimmerBox(width:60,height:14,borderRadius:6)])),ShimmerBox(width:135,height:42,borderRadius:12)]));
    final path = _cleanPath(avatarPath);
    return Container(padding: const EdgeInsets.only(top:10,bottom:8,left:16,right:16), child: Row(children:[
      GestureDetector(onTap:onProfilePressed, child: Container(width:60,height:60,decoration:BoxDecoration(shape:BoxShape.circle,color:AppColors.avatarBg,border:Border.all(color:ringColor,width:2),boxShadow:[BoxShadow(color:ringColor.withValues(alpha:.4),blurRadius:10,spreadRadius:1)]),child:ClipOval(child:_avatar(path)))),
      const SizedBox(width:14),
      Expanded(child:Column(crossAxisAlignment:CrossAxisAlignment.start,mainAxisSize:MainAxisSize.min,children:[Text(username,maxLines:1,overflow:TextOverflow.ellipsis,style:GoogleFonts.poppins(color:AppColors.profileName,fontSize:17,fontWeight:FontWeight.w700)),const SizedBox(height:4),GestureDetector(onTap:onProfilePressed,child:Container(padding:const EdgeInsets.symmetric(horizontal:8,vertical:2),decoration:BoxDecoration(color:profileTagBg,borderRadius:BorderRadius.circular(14),border:Border.all(color:Colors.white.withValues(alpha:.15))),child:Row(mainAxisSize:MainAxisSize.min,children:[Text(userTag,style:GoogleFonts.poppins(color:profileTagColor,fontSize:10,fontWeight:FontWeight.w700)),Icon(Icons.play_arrow_rounded,color:profileTagColor,size:10)])))])),
      Material(color:Colors.transparent,child:InkWell(onTap:onAddMoneyPressed,borderRadius:BorderRadius.circular(12),child:Container(padding:const EdgeInsets.symmetric(horizontal:14,vertical:8),decoration:BoxDecoration(gradient:LinearGradient(begin:Alignment.topCenter,end:Alignment.bottomCenter,colors:[walletGradientStart,walletGradientEnd]),borderRadius:BorderRadius.circular(12),boxShadow:[BoxShadow(color:walletGradientEnd.withValues(alpha:.5),blurRadius:10,offset:const Offset(0,4))]),child:Row(mainAxisSize:MainAxisSize.min,children:[SvgPicture.asset('Assets/nav_icon/wallet.svg',width:22,height:22,colorFilter:const ColorFilter.mode(Colors.white,BlendMode.srcIn)),const SizedBox(width:8),Text('$currencySymbol${balance.toInt()}',style:GoogleFonts.inter(color:Colors.white,fontSize:17,fontWeight:FontWeight.w800)),const SizedBox(width:10),Container(width:1,height:18,color:Colors.white.withValues(alpha:.35)),const SizedBox(width:10),Text(addCashLabel,style:GoogleFonts.poppins(color:Colors.white,fontSize:18,fontWeight:FontWeight.w800))])))),
    ]));
  }

  Widget _avatar(String p) {
    final url = p.startsWith('http://') || p.startsWith('https://') ? p : '${ApiService.serverDomain}$p';
    if (p.startsWith('/')) return Image.network(url,width:60,height:60,fit:BoxFit.cover,errorBuilder:(context,error,stackTrace)=>Container(color:AppColors.avatarBg,child:const Icon(Icons.person,color:Colors.white70,size:36)));
    final name=p.split('/').last.isEmpty?'avatar_1.png':p.split('/').last;
    return Image.asset('Assets/Avatar/$name',width:60,height:60,fit:BoxFit.cover,errorBuilder:(context,error,stackTrace)=>Container(color:AppColors.avatarBg,child:const Icon(Icons.person,color:Colors.white70,size:36)));
  }
}