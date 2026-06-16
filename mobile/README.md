# MART ECR MPOS

React Native + Expo + TypeScript mobile POS for Saudi baqala / mart.

## Run
```
npm install
npx expo start
```

## Mock logins
Tap any user on the login screen — no real auth.

## Stack
- Expo SDK 51, RN 0.74, TS strict
- React Navigation (native-stack + bottom-tabs)
- Zustand + Context for state, AsyncStorage for session
- Purple/white theme (#6D28D9)

All data is mock — see `src/services/mockApi.ts`.