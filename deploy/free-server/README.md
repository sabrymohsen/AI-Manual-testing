# Free hosting (Oracle Cloud Always Free)

Runs the whole app on one free VM: website, Postgres, Redis, test worker,
live recorder, chat/notification socket, and automatic HTTPS.

## 1. Create the free server (one time, ~10 min)
1. Sign up at https://signup.cloud.oracle.com. They ask for a card to verify you; Always Free resources are never charged.
2. Go to **Compute → Instances → Create instance**:
   - Image: **Ubuntu 22.04**
   - Shape: **Ampere VM.Standard.A1.Flex**, 4 OCPU, 24 GB RAM (all free)
   - SSH keys: **Save private key** (download it)
3. Open the instance → **Subnet → Default Security List → Add Ingress Rules**:
   source `0.0.0.0/0`, TCP, destination ports `80,443`.
4. Copy the instance **Public IP**.

## 2. Deploy (from this repo on your Mac)
```bash
chmod 600 ~/Downloads/ssh-key-*.key
./deploy/free-server/deploy.sh ubuntu@<PUBLIC_IP> ~/Downloads/ssh-key-*.key
```
The app is then live at `https://<ip-with-dashes>.sslip.io`. Run the same
command again to ship new code. Your data and secrets on the server are kept.

Have your own domain? Point `A` records for `example.com`, `rt.example.com`
and `rec.example.com` at the IP, then deploy with `DOMAIN=example.com ./deploy/...`
before the first run (or edit `~/qa-engine/deploy/free-server/.env` on the server).

## 3. Create your admin login
```bash
ssh -i <key> ubuntu@<IP>
cd ~/qa-engine/deploy/free-server
sudo docker compose exec -e ADMIN_EMAIL=you@example.com -e ADMIN_PASSWORD='StrongPass123!' \
  worker npx tsx scripts/create-super-admin.ts
```

## Useful commands (on the server, in ~/qa-engine/deploy/free-server)
- Logs: `sudo docker compose logs -f web` (or `worker`, `recorder`, `socket`)
- Restart: `sudo docker compose restart`
- DB backup: `sudo docker compose exec postgres pg_dump -U qa qa > backup.sql`
