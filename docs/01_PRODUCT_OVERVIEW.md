# Product overview — working specification

## Product
**ChartNexa Academy** (temporary name): mobile-first trading education platform. NOT a brokerage, real-money trade execution app, financial signal service or investment recommendation platform by default. Focus is courses, teaching, learning and academy operations.

## Confirmed business requirements
- Native-feeling app for **both iOS and Android**.
- Four roles: **Student, Instructor, Manager, Admin**.
- Admin has overall control. Manager handles day-to-day operations under Admin authority.
- Instructor capabilities are individually adjustable by Admin or permitted Manager; no universal instructor privilege assumption.
- Lectures can be **live, recorded, both or neither where content type allows**; live/recorded delivery is optional based on the course.
- Course resources support videos, images, PDFs, Word documents and other **approved, technically safe** formats.
- **One-time course purchase**; **Stripe** is the requested provider (subject to mobile-store distribution policy).
- **Lifetime course access** after valid purchase, subject to explicit unconfirmed exceptions such as refunds, takedowns or account sanctions.
- Enrolled students may **rate and review each course**.
- Working brand: white overall background, black typography, blue buttons/icons/highlight sections.

## Primary business objective
Educators create and distribute paid trading courses and resources. Students discover courses, make a valid purchase, learn at their own pace or attend available live classes, then leave feedback. Admin and Managers oversee the academy.

## Product scope boundaries
**Core candidate:** account, catalog, course detail, checkout/entitlement, learning player, permitted downloads, ratings/reviews, role-aware management, instructor permission controls, reporting necessary for operations.
**Proposed, not approved:** quizzes, certificates, chat/community, live provider, assignments, TradingView integration, trading journal, coupons, subscriptions, marketplace with third-party independent sellers, notifications beyond essential, multilingual experience, offline media, open reviews before purchase.

## Important external policy constraint
Stripe one-time payments are confirmed as the business preference. Apple and Google may require their own billing mechanisms for digital courses purchased inside mobile apps, depending on market, store, app classification and programs/entitlements. Before checkout implementation, evaluate the exact distribution model and current rules, seek client approval for compliant flow, and maintain one secure backend entitlement model. Do not assume a generic in-app Stripe checkout will pass review.

## Stakeholder sign-off
This version is a working planning baseline, not final client authorization for all proposed features. Keep confirmation and changes explicit.
