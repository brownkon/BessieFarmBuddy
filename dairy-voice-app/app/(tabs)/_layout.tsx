import { DrawerContentScrollView, DrawerItemList, DrawerToggleButton } from '@react-navigation/drawer';
import { Redirect } from 'expo-router';
import { Drawer } from 'expo-router/drawer';
import React from 'react';
import { Text, View } from 'react-native';

import { useAuth } from '@/components/AuthProvider';
import { HeaderProfileMenu } from '@/components/header-profile-menu';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Fonts, IndustrialColors, IndustrialTheme } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function TabLayout() {
  const { session, loading } = useAuth();
  const colorScheme = useColorScheme();
  const palette = colorScheme === 'dark' ? IndustrialColors.dark : IndustrialColors.light;
  const fonts = Fonts;

  if (loading) {
    return null;
  }

  if (!session) {
    return <Redirect href="/login" />;
  }

  return (
    <Drawer
      drawerContent={(props) => (
        <DrawerContentScrollView {...props}>
          <View
            style={{
              paddingTop: IndustrialTheme.spacing.sm,
              paddingHorizontal: IndustrialTheme.spacing.lg,
              paddingBottom: IndustrialTheme.spacing.md,
              borderBottomColor: palette.plateBorder,
              borderBottomWidth: IndustrialTheme.border.heavy,
              marginBottom: IndustrialTheme.spacing.xs,
            }}>
            <Text
              style={{
                color: palette.textPrimary,
                fontFamily: fonts.condensedBold,
                fontSize: 24,
                letterSpacing: 1,
                textTransform: 'uppercase',
              }}>
              Bovi
            </Text>
          </View>
          <DrawerItemList {...props} />
        </DrawerContentScrollView>
      )}
      screenOptions={{
        drawerPosition: 'left',
        drawerType: 'front',
        overlayColor: 'rgba(0, 0, 0, 0.22)',
        drawerActiveTintColor: palette.safetyOrange,
        drawerInactiveTintColor: palette.steelGray,
        drawerStyle: {
          backgroundColor: palette.plate,
          borderRightColor: palette.plateBorder,
          borderRightWidth: IndustrialTheme.border.heavy,
          width: 288,
        },
        drawerLabelStyle: {
          fontFamily: fonts.condensedBold,
          fontSize: 14,
          letterSpacing: 0.8,
          textTransform: 'uppercase',
        },
        drawerItemStyle: {
          borderRadius: IndustrialTheme.radius.control,
          marginHorizontal: IndustrialTheme.spacing.sm,
        },
        sceneStyle: {
          backgroundColor: palette.canvas,
        },
        headerStyle: {
          backgroundColor: palette.plate,
          borderBottomColor: palette.plateBorder,
          borderBottomWidth: IndustrialTheme.border.heavy,
        },
        headerTintColor: palette.textPrimary,
        headerTitleAlign: 'left',
        headerTitleStyle: {
          fontFamily: fonts.condensedBold,
          fontSize: 18,
          letterSpacing: 0.8,
          textTransform: 'uppercase',
        },
        headerLeftContainerStyle: {
          paddingLeft: IndustrialTheme.spacing.xs,
        },
        headerTitleContainerStyle: {
          paddingLeft: 0,
          marginLeft: IndustrialTheme.spacing.xs,
        },
        headerRightContainerStyle: {
          paddingRight: IndustrialTheme.spacing.sm,
        },
        headerLeft: (props) => <DrawerToggleButton {...props} tintColor={palette.textPrimary} />,
        headerRight: () => <HeaderProfileMenu />,
      }}>
      <Drawer.Screen
        name="index"
        options={{
          title: 'CHAT',
          drawerIcon: ({ color }) => <IconSymbol size={24} name="mic.fill" color={color} />,
        }}
      />
      <Drawer.Screen
        name="history"
        options={{
          title: 'CHAT HISTORY',
          drawerIcon: ({ color }) => <IconSymbol size={24} name="clock.fill" color={color} />,
        }}
      />
      <Drawer.Screen
        name="notes"
        options={{
          title: 'FARMER NOTES',
          drawerIcon: ({ color }) => <IconSymbol size={24} name="doc.text.fill" color={color} />,
        }}
      />
      <Drawer.Screen
        name="report"
        options={{
          title: 'REPORT SETTINGS',
          drawerIcon: ({ color }) => <IconSymbol size={24} name="list.bullet.clipboard.fill" color={color} />,
        }}
      />
      <Drawer.Screen
        name="gps-notes"
        options={{
          title: 'GPS NOTES',
          drawerIcon: ({ color }) => <IconSymbol size={24} name="mappin.and.ellipse" color={color} />,
        }}
      />
    </Drawer>
  );
}
