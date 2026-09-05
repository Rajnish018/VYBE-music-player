# Routing Goal

## Route Groups

```text
App.jsx
   |
   +-- PublicRoute
   |     |
   |     +-- /login    -> LoginPage
   |     +-- /register -> SignupPage
   |
   +-- PrivateRoute
   |     |
   |     +-- /dashboard -> Home
   |     +-- /discover  -> Discover
   |     +-- /library   -> Library
   |     +-- /favorites -> Favorites
   |
   +-- AdminRoute
         |
         +-- /admin -> AdminPage -> AdminDashboard
```

## Access Rules

```text
Request /admin
   |
   +-- not logged in -> /login
   |
   +-- logged in
         |
         +-- user.role === ADMIN?
               |
               +-- yes -> AdminDashboard
               +-- no  -> /dashboard
```

## Authorization Flow

```text
Authorization token
   |
   +-- Is token valid?
         |
         +-- Is user authenticated?
               |
               +-- For admin API: is user.role === ADMIN?
                     |
                     +-- allow or reject
```
