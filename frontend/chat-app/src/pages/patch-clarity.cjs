const fs = require('fs');

let c = fs.readFileSync('admin-clarity.tsx', 'utf8');

const theadOld = `<th className="p-4 font-medium">Role</th>
                      <th className="p-4 font-medium">Projects</th>
                      <th className="p-4 font-medium">Create Projects</th>
                      <th className="p-4 font-medium">Widget Studio</th>
                      <th className="p-4 font-medium">Context Engine</th>
                      <th className="p-4 font-medium">Advanced</th>`;

const theadNew = `<th className="p-4 font-medium">Role</th>
                      <th className="p-4 font-medium">Projects</th>`;

c = c.replace(theadOld, theadNew);

const tbodyOld = `<td className="p-4">
                          <select 
                            className="bg-transparent border border-border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary text-xs capitalize"
                            value={u.role}
                            onChange={(e) => updateFeaturesMutation.mutate({ id: u.id, role: e.target.value })}
                          >
                            <option value="user">User</option>
                            <option value="super_admin">Super Admin</option>
                          </select>
                        </td>
                        <td className="p-4 text-center font-medium">
                          {u.projectCount || 0}
                        </td>
                        <td className="p-4">
                          <Switch
                            checked={u.features?.canCreateProject ?? true}
                            onCheckedChange={(c) => updateFeaturesMutation.mutate({ id: u.id, features: { ...u.features, canCreateProject: c }})}
                          />
                        </td>
                        <td className="p-4">
                          <Switch
                            checked={u.features?.canUseWidgetStudio ?? false}
                            onCheckedChange={(c) => updateFeaturesMutation.mutate({ id: u.id, features: { ...u.features, canUseWidgetStudio: c }})}
                          />
                        </td>
                        <td className="p-4">
                          <Switch
                            checked={u.features?.canUseContextEngine ?? false}
                            onCheckedChange={(c) => updateFeaturesMutation.mutate({ id: u.id, features: { ...u.features, canUseContextEngine: c }})}
                          />
                        </td>
                        <td className="p-4">
                          <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => openCustomFeatureModal(u)}>
                            <Settings2 className="w-3.5 h-3.5" /> Custom JSON
                          </Button>
                        </td>`;

const tbodyNew = `<td className="p-4 capitalize">{u.role}</td>
                        <td className="p-4 text-center font-medium">{u.projectCount || 0}</td>`;

c = c.replace(new RegExp(tbodyOld.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), tbodyNew);

fs.writeFileSync('admin-clarity.tsx', c);
