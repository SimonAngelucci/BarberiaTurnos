import { requireAdmin } from "@/lib/auth";
import { getBusinessById } from "@/lib/db";
import { PaymentsForm } from "@/components/PaymentsForm";

export default async function PaymentsPage() {
  const { businessId } = await requireAdmin();
  const b = await getBusinessById(businessId);

  // Al formulario solo van campos seguros: el Access Token (aunque esté cifrado) nunca sale del servidor.
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Pagos online</h1>
      <p className="text-sm opacity-70">
        Cobrá la seña o el total con Mercado Pago. El dinero va directo a tu cuenta. Las notificaciones de pago se configuran solas.
      </p>
      <PaymentsForm
        currency={b.currency}
        enabled={b.paymentsEnabled}
        mode={b.paymentMode}
        depositType={b.depositType}
        depositValue={b.depositValue}
        allowPayLater={b.allowPayLater}
        paymentTemplate={b.paymentTemplate}
        connectedLabel={b.mpAccountLabel}
      />
    </div>
  );
}
