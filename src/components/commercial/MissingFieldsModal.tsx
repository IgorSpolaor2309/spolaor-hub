import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { trackLeadJourney } from "@/lib/leads.functions";

const missingFieldsSchema = z.object({
  razao_social: z.string().min(3, "Razão social é obrigatória"),
  cnpj: z.string().regex(/^\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}$/, "CNPJ inválido"),
  endereco: z.string().min(5, "Endereço completo é obrigatório"),
  nome_responsavel: z.string().min(3, "Nome do representante é obrigatório"),
  cpf_responsavel: z.string().regex(/^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$/, "CPF inválido"),
  email: z.string().email("E-mail inválido"),
  telefone: z.string().min(10, "Telefone inválido"),
});

type MissingFieldsValues = z.infer<typeof missingFieldsSchema>;

interface MissingFieldsModalProps {
  isOpen: boolean;
  onClose: () => void;
  leadId: string;
  initialData: any;
  missingFields: string[];
  onSuccess: (updatedData: any) => void;
}

export function MissingFieldsModal({
  isOpen,
  onClose,
  leadId,
  initialData,
  missingFields,
  onSuccess,
}: MissingFieldsModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const trackLeadFn = useServerFn(trackLeadJourney);

  const form = useForm<MissingFieldsValues>({
    resolver: zodResolver(missingFieldsSchema),
    defaultValues: {
      razao_social: initialData?.razao_social || initialData?.company_name || "",
      cnpj: initialData?.cnpj || "",
      endereco: initialData?.endereco || initialData?.address || "",
      nome_responsavel: initialData?.nome_responsavel || initialData?.representative_name || "",
      cpf_responsavel: initialData?.cpf_responsavel || initialData?.representative_cpf || "",
      email: initialData?.email || "",
      telefone: initialData?.telefone || initialData?.phone || "",
    },
  });

  const onSubmit = async (values: MissingFieldsValues) => {
    setIsSubmitting(true);
    console.log("[MISSING_FIELDS_SUBMIT] Data:", values);
    
    try {
      // Update the lead with new data
      const result = await trackLeadFn({
        data: {
          leadId,
          journeyStep: 'dados_complementados',
          extractedData: {
            ...initialData,
            ...values,
            razao_social: values.razao_social,
            cnpj: values.cnpj,
            address: values.endereco,
            representative_name: values.nome_responsavel,
            representative_cpf: values.cpf_responsavel,
            email: values.email,
            phone: values.telefone
          },
          contactData: {
            name: values.nome_responsavel,
            email: values.email,
            phone: values.telefone
          },
          cnpj: values.cnpj,
          lastInteraction: "Dados cadastrais complementados pelo usuário via modal."
        }
      });

      console.log("[MISSING_FIELDS_SUCCESS]", result);
      toast.success("Dados atualizados com sucesso!");
      onSuccess(values);
      onClose();
    } catch (error) {
      console.error("[MISSING_FIELDS_ERROR]", error);
      toast.error("Erro ao atualizar dados. Tente novamente.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Only show fields that are in missingFields list
  const shouldShow = (field: string) => missingFields.includes(field);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !isSubmitting && !open && onClose()}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-amber-500" />
            Complete seus dados
          </DialogTitle>
          <DialogDescription>
            Precisamos de algumas informações adicionais para gerar o seu contrato corretamente.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
            {shouldShow("razao_social") && (
              <FormField
                control={form.control}
                name="razao_social"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Razão Social</FormLabel>
                    <FormControl>
                      <Input placeholder="Nome da empresa" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {shouldShow("cnpj") && (
              <FormField
                control={form.control}
                name="cnpj"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>CNPJ</FormLabel>
                    <FormControl>
                      <Input placeholder="00.000.000/0000-00" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {shouldShow("endereco") && (
              <FormField
                control={form.control}
                name="endereco"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Endereço Completo</FormLabel>
                    <FormControl>
                      <Input placeholder="Rua, Número, Bairro, Cidade - UF" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <div className="grid grid-cols-2 gap-4">
              {shouldShow("nome_responsavel") && (
                <FormField
                  control={form.control}
                  name="nome_responsavel"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Representante</FormLabel>
                      <FormControl>
                        <Input placeholder="Nome completo" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {shouldShow("cpf_responsavel") && (
                <FormField
                  control={form.control}
                  name="cpf_responsavel"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>CPF</FormLabel>
                      <FormControl>
                        <Input placeholder="000.000.000-00" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              {shouldShow("email") && (
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>E-mail</FormLabel>
                      <FormControl>
                        <Input placeholder="email@exemplo.com" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {shouldShow("telefone") && (
                <FormField
                  control={form.control}
                  name="telefone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Telefone</FormLabel>
                      <FormControl>
                        <Input placeholder="(00) 00000-0000" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>

            <DialogFooter className="pt-4">
              <Button type="button" variant="ghost" onClick={onClose} disabled={isSubmitting}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  "Gerar Contrato"
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
