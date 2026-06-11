import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

export default function NotFound() {
  const t = useTranslations("notFound");

  return (
    <div className="max-w-4xl mx-auto px-4 py-16 text-center">
      <h1 className="text-4xl font-bold text-zinc-300 mb-4">404</h1>
      <h2 className="text-lg font-semibold mb-2">{t("title")}</h2>
      <p className="text-zinc-500 text-sm mb-6">{t("description")}</p>
      <Link
        href="/"
        className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
      >
        {t("home")}
      </Link>
    </div>
  );
}
