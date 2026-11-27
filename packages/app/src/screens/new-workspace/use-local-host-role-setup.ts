import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "@/contexts/toast-context";
import { useLocalDaemonServerId } from "@/hooks/use-is-local-daemon";
import type { HostProfile } from "@/types/host-connection";
import { needsLocalHostRoleSetup } from "../settings/local-host-role";

function useLocalHostRoleSetup(input: {
  selectedServerId: string;
  localServerId: string | null;
  host: HostProfile | null;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [prompted, setPrompted] = useState(false);
  const required = needsLocalHostRoleSetup(input);
  const message = t("newWorkspace.errors.localRoleRequired");

  useEffect(() => {
    if (!required) setPrompted(false);
  }, [required]);

  const ensureLocalRoleReady = useCallback(() => {
    if (!required) return true;
    setPrompted(true);
    toast.error(message);
    return false;
  }, [message, required, toast]);

  return {
    localRoleErrorMessage: prompted ? message : null,
    ensureLocalRoleReady,
  };
}

export function useSelectedLocalHostRoleSetup(input: {
  hosts: HostProfile[];
  selectedServerId: string;
}) {
  const localServerId = useLocalDaemonServerId();
  const host = useMemo(
    () => input.hosts.find((candidate) => candidate.serverId === input.selectedServerId) ?? null,
    [input.hosts, input.selectedServerId],
  );
  return useLocalHostRoleSetup({
    selectedServerId: input.selectedServerId,
    localServerId,
    host,
  });
}
