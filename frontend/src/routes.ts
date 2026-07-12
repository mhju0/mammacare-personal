import { createBrowserRouter, createHashRouter } from "react-router";
import { Capacitor } from "@capacitor/core";
import Layout from "./components/Layout";
import HomeRoute from "./pages/HomeRoute";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Schedule from "./pages/Schedule";
import Nutrition from "./pages/Nutrition";
import Recipes from "./pages/Recipes";
import Allergy from "./pages/Allergy";
import Ingredients from "./pages/Ingredients";
import Observe from "./pages/Observe";
import Community from "./pages/Community";
import Profile from "./pages/Profile";
import ProfileSelect from "./pages/ProfileSelect";
import ProfileAdd from "./pages/ProfileAdd";
import ProfileEdit from "./pages/ProfileEdit";
import Notifications from "./pages/Notifications";
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound";
import AuthCallback from "./pages/AuthCallback";
import AdminHome from "./pages/admin/AdminHome";
import AdminDashboard from "./pages/admin/AdminData";
import AdminUsers from "./pages/admin/AdminUsers";
import AdminContent from "./pages/admin/AdminContent";
import AdminNotice from "./pages/admin/AdminCommunity";
import AdminSecurity from "./pages/admin/AdminPermissions";
import AdminPayments from "./pages/admin/AdminPayments";
import TermsOfService from "./pages/TermsOfService";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import OpenSourceLicense from "./pages/OpenSourceLicense";
import About from "./pages/About";
import Tutorial from "./pages/Tutorial";

const createRouter = Capacitor.isNativePlatform() ? createHashRouter : createBrowserRouter;

export const router = createRouter([
  { path: "/guide", Component: Tutorial },   // ← Layout 바깥 (전체화면)
  {
    path: "/",
    Component: Layout,
    children: [
      { index: true, Component: HomeRoute },
      { path: "login", Component: Login },
      { path: "signup", Component: Register },
      { path: "register", Component: Register },
      { path: "schedule", Component: Schedule },
      { path: "nutrition", Component: Nutrition },
      { path: "recipes", Component: Recipes },
      { path: "allergy", Component: Allergy },
      { path: "ingredients", Component: Ingredients },
      { path: "observe/:testingId", Component: Observe },
      { path: "community", Component: Community },
      { path: "community/posts/:postId", Component: Community },
      { path: "profile", Component: Profile },
      { path: "profile/add", Component: ProfileAdd },
      { path: "profile/edit", Component: ProfileEdit },
      { path: "profile-select", Component: ProfileSelect },
      { path: "auth/callback", Component: AuthCallback },
      { path: "notifications", Component: Notifications },
      { path: "settings", Component: Settings },
      { path: "about", Component: About },
      { path: "terms", Component: TermsOfService },
      { path: "privacy", Component: PrivacyPolicy },
      { path: "licenses", Component: OpenSourceLicense },
      { path: "admin", Component: AdminHome },
      { path: "admin/dashboard", Component: AdminDashboard },
      { path: "admin/users", Component: AdminUsers },
      { path: "admin/content", Component: AdminContent },
      { path: "admin/notice", Component: AdminNotice },
      { path: "admin/security", Component: AdminSecurity },
      { path: "admin/payments", Component: AdminPayments },
      { path: "*", Component: NotFound },
    ],
  },
]);