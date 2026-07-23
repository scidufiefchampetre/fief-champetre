import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { Toaster } from "sonner";

import appCss from "../styles.css?url";
import { reportLovableError } from "../core/lovable-error-reporting";
import { useExpenseStore } from "../core/store/expense-store";
import { AppHeader } from "../core/components/app-header";
import { MemberGate } from "../core/components/member-gate";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page introuvable</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Cette page n’existe pas ou a été déplacée.
        </p>
        <div className="mt-6">
          <Link to="/" className="page-action">
            Revenir à l’accueil
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          La page ne s’est pas chargée
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Tu peux réessayer ou revenir à l’accueil.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="page-action"
          >
            Réessayer
          </button>
          <a
            href="/"
            className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-input bg-background px-4 py-2 text-sm font-bold text-foreground transition-colors hover:bg-accent"
          >
            Accueil
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Fief Champêtre" },
      { name: "description", content: "Dépose une facture, on te rembourse." },
      { property: "og:title", content: "Fief Champêtre" },
      { property: "og:description", content: "Dépose une facture, on te rembourse." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Fief Champêtre" },
      { name: "twitter:description", content: "Dépose une facture, on te rembourse." },
      {
        property: "og:image",
        content:
          "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/015be59d-61e1-4865-93b2-bff21fb210c1/id-preview-22b46013--0520b389-d0c5-4937-b01d-7f68c1570ecb.lovable.app-1783511634027.png",
      },
      {
        name: "twitter:image",
        content:
          "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/015be59d-61e1-4865-93b2-bff21fb210c1/id-preview-22b46013--0520b389-d0c5-4937-b01d-7f68c1570ecb.lovable.app-1783511634027.png",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  const themeScript = `(function(){try{var t=localStorage.getItem('ff-theme');if(!t){t=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}if(t==='dark'){document.documentElement.classList.add('dark');}}catch(e){}})();`;
  return (
    <html lang="fr">
      <head>
        <HeadContent />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <div>
        <IdentificationGate>
          {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
          <Outlet />
        </IdentificationGate>
      </div>
      {/* DraftBar removed — tasks now save directly */}
      <Toaster position="top-center" richColors closeButton={false} />
    </QueryClientProvider>
  );
}

// Point d'entrée unique de toute l'app : on ne rend aucune route tant que la
// personne ne s'est pas identifiée (même look & feel que le module facture,
// c'est la même brique <MemberGate>). Une fois identifiée, la route demandée
// (accueil, agenda, mes réservations…) s'affiche normalement.
function IdentificationGate({ children }: { children: ReactNode }) {
  const store = useExpenseStore();
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    useExpenseStore.getState().hydrateConfig();
    useExpenseStore.getState().hydrateMember();
    useExpenseStore.getState().hydrateMembersCache();
    setHydrated(true);
  }, []);

  // Le temps d'hydrater depuis localStorage, on n'affiche rien plutôt que de
  // laisser flasher le gate à tort pour quelqu'un déjà identifié.
  if (!hydrated) return null;

  if (!store.member) {
    return (
      <main className="min-h-dvh w-full bg-background">
        <div className="mx-auto flex min-h-dvh w-full max-w-xl flex-col px-6 py-6 sm:py-10">
          <AppHeader variant="home" />
          <MemberGate
            onMember={(m) => store.setMember(m)}
            spreadsheetId={store.spreadsheetId}
            onConfig={(id) => store.setConfig({ spreadsheetId: id })}
          />
        </div>
      </main>
    );
  }

  return <>{children}</>;
}
