# Demo accounts

Development sign-in only. These accounts are not created in production. Email verification is not required.

Every account uses the same password: `Ikiraro-demo-1`

On the sign-in page, choose **Use email and password**, then the address below. Google sign-in stays available and does not check whether Google has verified the email.

| Role | Email |
| --- | --- |
| Learner | learner@demo.ikiraro.test |
| Trainer | trainer@demo.ikiraro.test |
| Center manager | manager@demo.ikiraro.test |
| District coordinator | coordinator@demo.ikiraro.test |
| Content author | author@demo.ikiraro.test |
| Content reviewer | reviewer@demo.ikiraro.test |
| Hardware officer | hardware@demo.ikiraro.test |
| Allocation committee member | committee@demo.ikiraro.test |
| Auditor | auditor@demo.ikiraro.test |
| Platform admin | admin@demo.ikiraro.test |
| Mentor | mentor@demo.ikiraro.test |
| Public verifier | verifier@demo.ikiraro.test |

The trainer is assigned to Gitega Learning Center and Huye Learning Center. The center manager is assigned to Gitega only. The learner's home center is Gitega. The district coordinator is scoped to Nyarugenge. The other staff roles are global. Run `bun run db:seed` from `engine/` to create or reset them.
