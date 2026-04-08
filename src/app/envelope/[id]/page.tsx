import { redirect } from "next/navigation";

export default async function EnvelopeRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/perso/patrimoine/envelope/${id}`);
}
