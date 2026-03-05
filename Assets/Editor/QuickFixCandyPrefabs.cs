using UnityEngine;
using UnityEditor;

public class QuickFixCandyPrefabs : MonoBehaviour
{
    [MenuItem("Tools/Quick Fix Candy Prefabs")]
    public static void QuickFixPrefabs()
    {
        string[] prefabPaths = {
            "Assets/Prefabs/Red.prefab",
            "Assets/Prefabs/Blue.prefab", 
            "Assets/Prefabs/Green.prefab",
            "Assets/Prefabs/Yellow.prefab",
            "Assets/Prefabs/Purple.prefab"
        };
        
        foreach (string path in prefabPaths)
        {
            GameObject prefab = AssetDatabase.LoadAssetAtPath<GameObject>(path);
            if (prefab != null)
            {
                // Transform'ı sıfırla
                prefab.transform.position = Vector3.zero;
                prefab.transform.rotation = Quaternion.identity;
                prefab.transform.localScale = Vector3.one;
                
                Candy candy = prefab.GetComponent<Candy>();
                if (candy != null)
                {
                    // candyType ata
                    if (path.Contains("Red"))
                        candy.candyType = Candy.CandyType.Red;
                    else if (path.Contains("Blue"))
                        candy.candyType = Candy.CandyType.Blue;
                    else if (path.Contains("Green"))
                        candy.candyType = Candy.CandyType.Green;
                    else if (path.Contains("Yellow"))
                        candy.candyType = Candy.CandyType.Yellow;
                    else if (path.Contains("Purple"))
                        candy.candyType = Candy.CandyType.Magenta;
                    
                    candy.candyId = (int)candy.candyType;
                    candy.candyID = (int)candy.candyType;
                    
                    EditorUtility.SetDirty(candy);
                    Debug.Log($"Fixed {path}");
                }
                
                PrefabUtility.SaveAsPrefabAsset(prefab, path);
            }
        }
        
        AssetDatabase.SaveAssets();
        AssetDatabase.Refresh();
        Debug.Log("Quick fix completed!");
    }
}
