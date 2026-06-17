import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Trash2 } from "lucide-react";

type Props = {
  onConfirm: () => void;
  label?: string;
  iconOnly?: boolean;
  description?: string;
  size?: ButtonProps["size"];
  variant?: ButtonProps["variant"];
  disabled?: boolean;
  className?: string;
};

/**
 * Botão padronizado de exclusão com modal de confirmação.
 * Mensagem padrão alerta sobre impacto no histórico do cliente.
 */
export function DeleteButton({
  onConfirm,
  label = "Excluir",
  iconOnly = false,
  description = "Tem certeza que deseja excluir? Esta ação pode afetar o histórico do cliente.",
  size = "sm",
  variant = "ghost",
  disabled,
  className,
}: Props) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" size={size} variant={variant} disabled={disabled} className={`text-destructive ${className ?? ""}`}>
          <Trash2 className={iconOnly ? "h-4 w-4" : "mr-1 h-3.5 w-3.5"} />
          {!iconOnly && label}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Excluir
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
