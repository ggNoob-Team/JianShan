import { useHostRouteServerId } from "@/navigation/host-route-context";
import { TeamScreen } from "@/screens/team-screen";

export default function HostTeamRoute() {
  const serverId = useHostRouteServerId();
  return serverId ? <TeamScreen serverId={serverId} /> : null;
}
