import AuthForm from "@/components/AuthForm";

export const metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default function SignInPage() {
  return <AuthForm mode="signin" />;
}
