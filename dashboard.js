// EshyBrand LMS - learner dashboard

const SUPABASE_URL = 'https://pjytyuhpubzuxbftuyqz.supabase.co';
const SUPABASE_KEY = 'sb_publishable_jgggDCLJA5EjSkhjnJ7hBQ_rr5nolsm';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const TYPE_NAMES = { workbook: 'Learner Workbook', summative_test: 'Summative Test' };

document.getElementById('logoutBtn').addEventListener('click', async () => {
  await sb.auth.signOut();
  window.location.href = 'index.html';
});

async function loadDashboard() {
  // 1. Make sure the learner is logged in
  const { data: sessionData } = await sb.auth.getSession();
  if (!sessionData.session) {
    window.location.href = 'login.html';
    return;
  }
  const user = sessionData.session.user;

  // 2. Get the learner's profile (name and role)
  const { data: profile } = await sb
    .from('profiles')
    .select('full_name, role')
    .eq('id', user.id)
    .single();

  document.getElementById('userName').textContent =
    (profile && profile.full_name) || user.email;

  if (profile && profile.role === 'admin') {
    document.getElementById('adminLink').style.display = 'inline-block';
  }

  // 3. Get all documents and this learner's submissions
  const { data: docs, error: docError } = await sb
    .from('documents')
    .select('id, title, doc_type, created_at')
    .order('created_at', { ascending: true });

  const { data: subs } = await sb
    .from('submissions')
    .select('document_id, status')
    .eq('user_id', user.id);

  const statusByDoc = {};
  (subs || []).forEach((s) => (statusByDoc[s.document_id] = s.status));

  // 4. Show the documents
  const list = document.getElementById('docList');
  let notStarted = 0, inProgress = 0, submitted = 0;

  if (docError || !docs || docs.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = docError
      ? 'Could not load documents. Please refresh the page.'
      : 'No documents have been uploaded yet. Please check back later.';
    list.appendChild(empty);
  } else {
    docs.forEach((d) => {
      const status = statusByDoc[d.id] || 'not_started';
      if (status === 'submitted') submitted++;
      else if (status === 'in_progress') inProgress++;
      else notStarted++;
      list.appendChild(buildCard(d, status));
    });
  }

  document.getElementById('cNot').textContent = notStarted;
  document.getElementById('cProg').textContent = inProgress;
  document.getElementById('cDone').textContent = submitted;

  document.getElementById('loading').style.display = 'none';
  document.getElementById('content').style.display = 'block';
}

function buildCard(d, status) {
  const card = document.createElement('div');
  card.className = 'doc';

  const info = document.createElement('div');
  const title = document.createElement('h3');
  title.textContent = d.title;

  const badge = document.createElement('span');
  badge.className = 'badge';
  if (status === 'submitted') { badge.textContent = 'Submitted'; badge.classList.add('done'); }
  else if (status === 'in_progress') { badge.textContent = 'In progress'; badge.classList.add('progress'); }
  else { badge.textContent = 'Not started'; }
  title.appendChild(badge);

  const type = document.createElement('small');
  type.textContent = TYPE_NAMES[d.doc_type] || d.doc_type;

  info.appendChild(title);
  info.appendChild(type);

  const link = document.createElement('a');
  link.className = 'btn fill';
  link.href = 'editor.html?doc=' + encodeURIComponent(d.id);
  link.textContent = status === 'submitted' ? 'View' : status === 'in_progress' ? 'Continue' : 'Start';

  card.appendChild(info);
  card.appendChild(link);
  return card;
}

loadDashboard();