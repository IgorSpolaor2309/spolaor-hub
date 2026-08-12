import { createFileRoute, Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { AppLogo } from "@/components/sc/Logo";
import { ShieldCheck, Lock, Database, UserCheck, FileText, Mail } from "lucide-react";

export const Route = createFileRoute("/seguranca")({
  head: () => ({
    meta: [
      { title: "Segurança e Privacidade — Digital SC" },
      {
        name: "description",
        content:
          "Práticas de segurança, privacidade e tratamento de dados da Digital SC: autenticação, controle de acesso, infraestrutura e contato.",
      },
      { property: "og:title", content: "Segurança e Privacidade — Digital SC" },
      {
        property: "og:description",
        content:
          "Como a Digital SC protege os dados de clientes, colaboradores e empresas vinculadas.",
      },
    ],
  }),
  component: TrustPage,
});

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="p-6">
      <div className="flex items-start gap-4">
        <div className="rounded-lg bg-primary/10 p-2.5 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex-1 space-y-2">
          <h2 className="text-lg font-semibold">{title}</h2>
          <div className="space-y-2 text-sm leading-relaxed text-muted-foreground">
            {children}
          </div>
        </div>
      </div>
    </Card>
  );
}

function TrustPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto flex max-w-4xl items-center justify-between px-4 py-4">
          <Link to="/" className="flex items-center gap-2">
            <AppLogo className="h-7 w-auto" />
          </Link>
          <Link
            to="/auth"
            search={{ next: undefined }}
            className="text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            Entrar
          </Link>
        </div>
      </header>

      <main className="container mx-auto max-w-4xl px-4 py-12">
        <div className="mb-10 space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            <ShieldCheck className="h-3.5 w-3.5" />
            Segurança e Privacidade
          </div>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Como protegemos seus dados
          </h1>
          <p className="text-muted-foreground">
            Esta página é mantida pela equipe da Digital SC para responder dúvidas
            comuns sobre segurança, privacidade e tratamento de dados na plataforma.
            O conteúdo é editorial: não é uma certificação independente nem uma
            verificação emitida por terceiros.
          </p>
        </div>

        <div className="grid gap-4">
          <Section icon={UserCheck} title="Autenticação e controle de acesso">
            <p>
              O acesso é feito por conta individual com e-mail e senha. Cada
              usuário enxerga apenas as empresas e documentos aos quais foi
              explicitamente vinculado pela equipe administradora.
            </p>
            <p>
              Os perfis (administrador, colaborador, cliente) são gerenciados no
              servidor, e a autorização é aplicada também no banco de dados via
              políticas de Row Level Security.
            </p>
          </Section>

          <Section icon={Lock} title="Proteção de dados em trânsito e repouso">
            <p>
              Todo o tráfego entre o navegador e a aplicação ocorre sobre HTTPS.
              Os dados ficam armazenados em banco gerenciado, com criptografia
              em repouso fornecida pela infraestrutura do provedor de nuvem.
            </p>
            <p>
              Os arquivos enviados (documentos solicitados, comprovantes, anexos
              do chat) são guardados em bucket privado, acessível somente por
              URLs assinadas e de curta duração para usuários autorizados.
            </p>
          </Section>

          <Section icon={Database} title="Quais dados coletamos e por quê">
            <p>
              Coletamos apenas os dados necessários para a operação contábil:
              dados cadastrais das empresas vinculadas, dados de contato do
              usuário, documentos enviados, mensagens trocadas na plataforma e
              registros de atividade (histórico).
            </p>
            <p>
              Não vendemos dados pessoais e não compartilhamos com terceiros
              fora do necessário para a prestação do serviço.
            </p>
          </Section>

          <Section icon={FileText} title="Retenção e exclusão">
            <p>
              Cada usuário pode remover os arquivos e mensagens que ele mesmo
              enviou diretamente na interface. A exclusão definitiva de uma
              empresa do hub é feita pela equipe administradora mediante
              solicitação.
            </p>
            <p>
              Para solicitar exportação ou exclusão dos seus dados pessoais,
              entre em contato pelo canal indicado abaixo.
            </p>
          </Section>

          <Section icon={ShieldCheck} title="Infraestrutura e responsabilidade compartilhada">
            <p>
              A aplicação é construída sobre a plataforma Lovable e utiliza
              infraestrutura gerenciada para banco de dados, autenticação e
              armazenamento de arquivos. O provedor é responsável pela camada de
              infraestrutura; a equipe da Digital SC é responsável pela
              configuração da aplicação, pelas regras de acesso e pelo
              tratamento dos dados dos clientes.
            </p>
            <p>
              Esta página descreve controles atualmente habilitados; ela não
              representa certificação de conformidade (LGPD, ISO, SOC etc.).
              Caso você precise de documentação formal, entre em contato.
            </p>
          </Section>

          <Section icon={Mail} title="Contato de segurança e privacidade">
            <p>
              Para relatar incidentes, vulnerabilidades ou dúvidas sobre
              privacidade, entre em contato com a equipe administradora do hub
              pelo canal oficial fornecido no seu contrato de prestação de
              serviços contábeis.
            </p>
          </Section>
        </div>

        <p className="mt-10 text-center text-xs text-muted-foreground">
          Última atualização: Junho de 2026 · Conteúdo editável pela equipe da
          Digital SC.
        </p>
      </main>
    </div>
  );
}
