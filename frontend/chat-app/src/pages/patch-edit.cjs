const fs = require('fs');
let c = fs.readFileSync('admin-project-edit.tsx', 'utf8');

const errUI = `  if (!isNew && (isError || (!isLoading && !project))) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground p-12 mt-20">
        <ShieldAlert className="w-12 h-12 text-destructive/50" />
        <h2 className="text-xl font-semibold text-foreground">Access Denied</h2>
        <p>You don't have permission to view this project or it does not exist.</p>
        <Button variant="outline" onClick={() => setLocation("/")}>Go Back</Button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full p-12 mt-20">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }`;

c = c.replace('  if (isNew) {\n    return <OnboardingWizard />;\n  }', '  if (isNew) {\n    return <OnboardingWizard />;\n  }\n\n' + errUI);
fs.writeFileSync('admin-project-edit.tsx', c);
